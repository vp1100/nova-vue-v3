"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VueLanguageService = void 0;
const index_1 = require("../config/index");
const debug_1 = require("../lsp/debug");
const position_1 = require("../lsp/position");
const logger_1 = require("../shared/logger");
const index_2 = require("../status/index");
const index_3 = require("../toolchain/index");
const bridge_1 = require("../tsserver/bridge");
const debug_2 = require("../workspace/debug");
const paths_1 = require("../workspace/paths");
const vue_editor_1 = require("../workspace/vue-editor");
const client_factory_1 = require("./client-factory");
const memory_retry_1 = require("./memory-retry");
const node_validation_1 = require("./node-validation");
class VueLanguageService {
    constructor() {
        this.client = null;
        this.tsserverBridge = null;
        this.restartTimer = null;
        this.capabilitiesTimer = null;
        this.lifecycle = 0;
        this.preferBundledTsdkForNextStart = false;
        this.memoryRetryUsed = false;
        this.temporaryMaxOldSpaceSize = null;
        this.expectedStop = false;
        this.status = (0, index_2.createInitialStatus)();
    }
    ensureStarted(reason = "vue file opened") {
        if (this.client || this.status.state === "starting") {
            return;
        }
        this.start(reason);
    }
    start(reason = "start") {
        if (this.client || this.status.state === "starting") {
            (0, logger_1.debug)(this.status.config, `language server already started; ignoring ${reason}`);
            return;
        }
        const config = (0, index_1.readConfig)();
        (0, logger_1.info)(`starting language server (${reason})`);
        if (!config.serverEnabled) {
            this.status.config = config;
            this.status.state = "idle";
            this.status.running = false;
            this.status.diagnostics = "disabled";
            this.status.lastRestartReason = reason;
            this.status.lastError = "Vue language server is disabled in settings.";
            (0, logger_1.info)("language server disabled by settings");
            return;
        }
        const nodeError = (0, node_validation_1.validateNodePath)(config);
        if (nodeError) {
            this.status.config = config;
            this.status.state = "failed";
            this.status.running = false;
            this.status.diagnostics = "disabled";
            this.status.lastRestartReason = reason;
            this.status.lastError = nodeError;
            (0, logger_1.error)(nodeError);
            nova.workspace.showErrorMessage(nodeError);
            return;
        }
        const preferBundledTsdk = this.preferBundledTsdkForNextStart;
        this.preferBundledTsdkForNextStart = false;
        const toolchain = (0, index_3.resolveToolchain)(config, { preferBundledTsdk });
        this.status.config = config;
        this.status.toolchain = toolchain;
        this.status.lastRestartReason = reason;
        this.status.lazyStart = false;
        this.status.diagnostics = "waiting";
        (0, logger_1.logToolchain)(config, toolchain);
        (0, debug_2.logWorkspaceDebug)(config, reason);
        (0, debug_2.logActiveEditorDebug)(config, reason);
        if (!toolchain.server || !toolchain.tsdk) {
            this.status.state = "failed";
            this.status.running = false;
            this.status.diagnostics = "disabled";
            this.status.lastError = toolchain.errors.join("\n") || "Toolchain resolution failed.";
            (0, logger_1.error)(this.status.lastError);
            nova.workspace.showErrorMessage(this.status.lastError);
            return;
        }
        const bridge = new bridge_1.TsserverBridge(config);
        try {
            bridge.prepareProxy();
        }
        catch (bridgeError) {
            this.status.state = "failed";
            this.status.running = false;
            this.status.diagnostics = "disabled";
            this.status.lastError = `TypeScript proxy failed to start: ${String(bridgeError)}`;
            (0, logger_1.error)(this.status.lastError);
            nova.workspace.showErrorMessage(this.status.lastError);
            return;
        }
        this.tsserverBridge = bridge;
        this.status.tsserverBridge = bridge.status;
        const lifecycle = ++this.lifecycle;
        this.expectedStop = false;
        const client = (0, client_factory_1.createLanguageClient)(config, toolchain, {
            maxOldSpaceSize: this.effectiveMaxOldSpaceSize(config),
            temporaryMemoryRetry: this.temporaryMaxOldSpaceSize !== null
        });
        this.registerWorkspaceConfigurationHandler(client, config);
        bridge.attach(client);
        this.client = client;
        this.status.state = "starting";
        this.status.running = false;
        client.onDidStop((error) => {
            if (lifecycle !== this.lifecycle) {
                (0, logger_1.debug)(this.status.config, "ignoring stale language server stop event");
                return;
            }
            this.status.running = false;
            this.status.state = error ? "failed" : "idle";
            this.status.diagnostics = "disabled";
            this.status.lastError = error ? String(error) : null;
            this.status.tsserverBridge = this.tsserverBridge?.status ?? this.status.tsserverBridge;
            if (error) {
                (0, logger_1.warn)(`language server stopped with error: ${String(error)}`);
            }
            else if (!this.expectedStop) {
                (0, logger_1.warn)("language server stopped unexpectedly");
            }
            else {
                (0, logger_1.debug)(this.status.config, "language server stopped");
            }
            this.expectedStop = false;
            if (error && this.handleMemoryError(config)) {
                return;
            }
            if (error && this.shouldTryBundledTsdkFallback(toolchain)) {
                this.status.fallbackRestartUsed = true;
                this.preferBundledTsdkForNextStart = true;
                (0, logger_1.warn)("retrying with bundled TypeScript SDK");
                this.restart("typescript sdk fallback");
            }
        });
        try {
            client.start();
            this.status.running = true;
            this.status.state = "running";
            this.status.diagnostics = "enabled";
            (0, logger_1.info)("language server started");
            this.scheduleCapabilitiesRefresh(lifecycle, client);
            this.refreshOpenVueEditors();
        }
        catch (startError) {
            bridge.stop();
            this.status.running = false;
            this.status.state = "failed";
            this.status.diagnostics = "disabled";
            this.status.lastError = String(startError);
            (0, logger_1.error)(`language server failed to start: ${String(startError)}`);
            nova.workspace.showErrorMessage(this.status.lastError);
        }
    }
    stop() {
        if (this.restartTimer) {
            clearTimeout(this.restartTimer);
            this.restartTimer = null;
        }
        if (this.capabilitiesTimer) {
            clearTimeout(this.capabilitiesTimer);
            this.capabilitiesTimer = null;
        }
        this.lifecycle += 1;
        if (this.client) {
            this.expectedStop = true;
            (0, logger_1.debug)(this.status.config, "stopping language server");
            this.client.stop();
            this.client = null;
        }
        if (this.tsserverBridge) {
            this.tsserverBridge.stop();
            this.status.tsserverBridge = this.tsserverBridge.status;
            this.tsserverBridge = null;
        }
        this.status.running = false;
        this.status.state = "idle";
        this.status.diagnostics = "disabled";
    }
    restart(reason = "manual restart") {
        (0, logger_1.info)(`restarting language server (${reason})`);
        this.stop();
        this.start(reason);
    }
    scheduleRestart(reason, delayMs = 1000) {
        const nextConfig = (0, index_1.readConfig)();
        if (!nextConfig.restartOnConfigChange && reason === "configuration changed") {
            this.status.config = nextConfig;
            (0, logger_1.debug)(this.status.config, "restart skipped because Restart On Configuration Change is disabled");
            return;
        }
        if (!this.client && this.status.state !== "starting") {
            this.status.config = nextConfig;
            (0, logger_1.debug)(this.status.config, `restart skipped while idle: ${reason}`);
            return;
        }
        if (this.restartTimer) {
            clearTimeout(this.restartTimer);
        }
        (0, logger_1.debug)(this.status.config, `restart scheduled: ${reason}`);
        this.restartTimer = setTimeout(() => {
            this.restartTimer = null;
            this.restart(reason);
        }, delayMs);
    }
    redetect() {
        this.status.fallbackRestartUsed = false;
        this.memoryRetryUsed = false;
        this.temporaryMaxOldSpaceSize = null;
        (0, index_3.invalidateToolchainCache)();
        this.restart("toolchain re-detect");
    }
    registerEditor(editor) {
        if ((0, vue_editor_1.isVueEditor)(editor) && !(0, paths_1.isIgnoredWorkspacePath)(editor.document.path)) {
            this.ensureStarted("vue editor opened");
        }
        return [
            editor.document.onDidChangeSyntax(() => {
                if ((0, vue_editor_1.isVueEditor)(editor) && !(0, paths_1.isIgnoredWorkspacePath)(editor.document.path)) {
                    this.ensureStarted("document syntax changed to vue");
                }
            }),
            editor.onDidStopChanging((changedEditor) => {
                if ((0, vue_editor_1.isVueEditor)(changedEditor) && !(0, paths_1.isIgnoredWorkspacePath)(changedEditor.document.path)) {
                    this.ensureStarted("vue editor changed");
                }
            }),
            editor.onDidSave((savedEditor) => {
                if ((0, vue_editor_1.isVueEditor)(savedEditor) && !(0, paths_1.isIgnoredWorkspacePath)(savedEditor.document.path)) {
                    this.ensureStarted("vue editor saved");
                }
            })
        ];
    }
    async syncEditorWithTsserver(editor) {
        if (!this.tsserverBridge || !editor.document.path) {
            return;
        }
        await this.tsserverBridge.updateVueFile(editor.document.path, (0, position_1.fullText)(editor));
    }
    async collectTypeScriptDiagnostics(file) {
        if (!this.tsserverBridge) {
            return [];
        }
        return [
            ...(await this.tsserverBridge.request("syntacticDiagnosticsSync", { file })),
            ...(await this.tsserverBridge.request("semanticDiagnosticsSync", { file })),
            ...(await this.tsserverBridge.request("suggestionDiagnosticsSync", { file }))
        ];
    }
    scheduleCapabilitiesRefresh(lifecycle, client) {
        if (this.capabilitiesTimer) {
            clearTimeout(this.capabilitiesTimer);
        }
        this.capabilitiesTimer = setTimeout(() => {
            this.capabilitiesTimer = null;
            if (lifecycle !== this.lifecycle || this.client !== client) {
                (0, logger_1.debug)(this.status.config, "capabilities refresh skipped for stale language server");
                return;
            }
            this.refreshCapabilities(lifecycle);
        }, 500);
    }
    async refreshCapabilities(lifecycle) {
        if (!this.client) {
            return null;
        }
        try {
            const capabilities = (await this.client.sendRequest("vue/serverCapabilities"));
            if (lifecycle !== undefined && lifecycle !== this.lifecycle) {
                return null;
            }
            this.status.capabilities = capabilities;
            (0, logger_1.debug)(this.status.config, `server capabilities: ${(0, debug_1.summarizeCapabilities)(capabilities)}`);
            return capabilities;
        }
        catch (capabilitiesError) {
            if (lifecycle !== undefined && lifecycle !== this.lifecycle) {
                (0, logger_1.debug)(this.status.config, "capabilities refresh failed for stale language server");
                return null;
            }
            (0, logger_1.warn)(`server capabilities unavailable: ${String(capabilitiesError)}`);
            return null;
        }
    }
    refreshOpenVueEditors() {
        for (const editor of nova.workspace.textEditors) {
            if ((0, vue_editor_1.isVueEditor)(editor) && !(0, paths_1.isIgnoredWorkspacePath)(editor.document.path)) {
                this.ensureStarted("vue editor refresh");
            }
        }
    }
    featureContext() {
        return {
            ensureStarted: (reason) => this.ensureStarted(reason),
            client: () => this.client,
            tsserverBridge: () => this.tsserverBridge,
            debugConfig: () => this.status.config,
            syncEditorWithTsserver: (editor) => this.syncEditorWithTsserver(editor),
            collectTypeScriptDiagnostics: (file) => this.collectTypeScriptDiagnostics(file),
            refreshCapabilities: () => this.refreshCapabilities()
        };
    }
    registerWorkspaceConfigurationHandler(client, config) {
        client.onRequest("workspace/configuration", (params) => {
            const items = isRecord(params) && Array.isArray(params.items) ? params.items : [];
            const result = items.map((item) => {
                const section = isRecord(item) && typeof item.section === "string" ? item.section : undefined;
                return (0, index_1.resolveConfigurationSection)(section);
            });
            (0, logger_1.debug)(config, `workspace/configuration: ${result.length} item(s)`);
            return result;
        });
    }
    shouldTryBundledTsdkFallback(toolchain) {
        if (this.status.fallbackRestartUsed || !toolchain.tsdk || toolchain.tsdk.source !== "workspace") {
            return false;
        }
        const error = (this.status.lastError || "").toLowerCase();
        return error.includes("typescript") || error.includes("tsdk") || error.includes("tsserverlibrary");
    }
    effectiveMaxOldSpaceSize(config) {
        if (this.temporaryMaxOldSpaceSize && this.temporaryMaxOldSpaceSize > config.maxOldSpaceSize) {
            return this.temporaryMaxOldSpaceSize;
        }
        return config.maxOldSpaceSize;
    }
    handleMemoryError(config) {
        const lastError = this.status.lastError || "";
        if (!(0, memory_retry_1.isOutOfMemoryError)(lastError)) {
            return false;
        }
        const currentLimit = this.effectiveMaxOldSpaceSize(config);
        const suggestedLimit = (0, memory_retry_1.suggestedMemoryLimit)(currentLimit);
        const message = (0, memory_retry_1.memoryLimitMessage)(currentLimit, suggestedLimit);
        (0, logger_1.warn)(message);
        if (!config.memoryAutoRetryEnabled || this.memoryRetryUsed || suggestedLimit <= currentLimit) {
            nova.workspace.showErrorMessage(message);
            return true;
        }
        this.memoryRetryUsed = true;
        this.temporaryMaxOldSpaceSize = suggestedLimit;
        nova.workspace.showWarningMessage(`${message} Retrying once with ${suggestedLimit} MB for this session.`);
        this.restart("memory limit retry");
        return true;
    }
}
exports.VueLanguageService = VueLanguageService;
function isRecord(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
}
