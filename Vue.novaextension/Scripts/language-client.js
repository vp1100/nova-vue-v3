"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VueLanguageService = void 0;

const config_1 = require("./config");
const paths_1 = require("./paths");
const status_1 = require("./status");
const logger_1 = require("./logger");
const workspace_debug_1 = require("./workspace-debug");
const tsserver_bridge_1 = require("./tsserver-bridge");
const vue_editor_1 = require("./vue-editor");
const workspace_paths_1 = require("./workspace-paths");
const lsp_edits_1 = require("./lsp-edits");
const lsp_debug_1 = require("./lsp-debug");
const lsp_position_1 = require("./lsp-position");
const tsserver_types_1 = require("./tsserver-types");
const workspace_paths_2 = require("./workspace-paths");

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
        this.status = (0, status_1.createInitialStatus)();
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
        const config = (0, config_1.readConfig)();
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
        const nodeError = validateNodePath(config);
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
        const toolchain = (0, paths_1.resolveToolchain)(config, { preferBundledTsdk });
        this.status.config = config;
        this.status.toolchain = toolchain;
        this.status.lastRestartReason = reason;
        this.status.lazyStart = false;
        this.status.diagnostics = "waiting";
        (0, logger_1.logToolchain)(config, toolchain);
        (0, workspace_debug_1.logWorkspaceDebug)(config, reason);
        (0, workspace_debug_1.logActiveEditorDebug)(config, reason);
        if (!toolchain.server || !toolchain.tsdk) {
            this.status.state = "failed";
            this.status.running = false;
            this.status.diagnostics = "disabled";
            this.status.lastError = toolchain.errors.join("\n") || "Toolchain resolution failed.";
            (0, logger_1.error)(this.status.lastError);
            nova.workspace.showErrorMessage(this.status.lastError);
            return;
        }
        const bridge = new tsserver_bridge_1.TsserverBridge(config);
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
        const client = this.createClient(config, toolchain);
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
        const nextConfig = (0, config_1.readConfig)();
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
        (0, paths_1.invalidateToolchainCache)();
        this.restart("toolchain re-detect");
    }
    async probeLspAtCursor() {
        const editor = nova.workspace.activeTextEditor;
        if (!editor || !(0, vue_editor_1.isVueEditor)(editor)) {
            nova.workspace.showInformativeMessage("Open a .vue editor and place the cursor on a symbol first.");
            return;
        }
        this.ensureStarted("lsp probe");
        const client = this.client;
        if (!client) {
            nova.workspace.showInformativeMessage("Vue language server is not running yet.");
            return;
        }
        const path = editor.document.path;
        const selection = editor.selectedRange;
        const position = (0, lsp_position_1.positionAt)(editor, selection.start);
        const textDocument = { uri: editor.document.uri };
        const cursor = `${(0, workspace_paths_2.relativeWorkspacePath)(path)}:${position.line + 1}:${position.character + 1}`;
        (0, logger_1.info)(`LSP probe: ${cursor}`);
        const probes = [
            {
                label: "hover",
                method: "textDocument/hover",
                params: { textDocument, position }
            },
            {
                label: "definition",
                method: "textDocument/definition",
                params: { textDocument, position }
            },
            {
                label: "references",
                method: "textDocument/references",
                params: { textDocument, position, context: { includeDeclaration: true } }
            },
            {
                label: "prepareRename",
                method: "textDocument/prepareRename",
                params: { textDocument, position }
            },
            {
                label: "codeAction",
                method: "textDocument/codeAction",
                params: {
                    textDocument,
                    range: { start: position, end: position },
                    context: { diagnostics: [] }
                }
            },
            {
                label: "signatureHelp",
                method: "textDocument/signatureHelp",
                params: {
                    textDocument,
                    position,
                    context: {
                        triggerKind: 1
                    }
                }
            }
        ];
        for (const probe of probes) {
            const startedAt = Date.now();
            try {
                const result = await client.sendRequest(probe.method, probe.params);
                (0, logger_1.info)(`LSP probe ${probe.label}: ${(0, lsp_debug_1.summarizeLspResult)(result)}, ${Date.now() - startedAt}ms`);
                (0, logger_1.debug)(this.status.config, `LSP probe ${probe.label} raw: ${(0, lsp_debug_1.stringifyCompact)(result)}`);
            }
            catch (probeError) {
                (0, logger_1.warn)(`LSP probe ${probe.label} failed: ${String(probeError)}`);
            }
        }
        nova.workspace.showInformativeMessage("Vue LSP probe finished. Check the Extension Console.");
    }
    async copyLspCapabilities() {
        this.ensureStarted("copy lsp capabilities");
        const capabilities = await this.refreshCapabilities();
        if (!capabilities) {
            nova.workspace.showInformativeMessage("Vue LSP capabilities are not available yet.");
            return;
        }
        await nova.clipboard.writeText(JSON.stringify(capabilities, null, 2));
        nova.workspace.showInformativeMessage("Vue LSP capabilities copied to clipboard.");
    }
    async renameSymbol(candidate) {
        const editor = textEditorOrActive(candidate);
        if (!editor || !(0, vue_editor_1.isVueEditor)(editor)) {
            nova.workspace.showInformativeMessage("Open a .vue editor and place the cursor on a symbol first.");
            return;
        }
        this.ensureStarted("rename symbol");
        const client = this.client;
        if (!client) {
            nova.workspace.showInformativeMessage("Vue language server is not running yet.");
            return;
        }
        editor.selectWordsContainingCursors();
        const selectedRange = editor.selectedRange;
        const selectedText = editor.selectedText || (0, lsp_position_1.symbolAt)(editor, selectedRange.start);
        const position = (0, lsp_position_1.positionAt)(editor, selectedRange.start);
        const newName = await inputPalette("New name for symbol", selectedText);
        if (!newName || newName === selectedText) {
            return;
        }
        const edit = await client.sendRequest("textDocument/rename", {
            textDocument: { uri: editor.document.uri },
            position,
            newName
        });
        if (!edit) {
            nova.workspace.showWarningMessage("Couldn't rename symbol.");
            return;
        }
        await (0, lsp_edits_1.applyWorkspaceEdit)(edit);
        await nova.workspace.openFile(editor.document.uri);
        editor.scrollToCursorPosition();
    }
    async quickFix(candidate) {
        const editor = textEditorOrActive(candidate);
        if (!editor || !(0, vue_editor_1.isVueEditor)(editor)) {
            nova.workspace.showInformativeMessage("Open a .vue editor and place the cursor on a Vue TypeScript issue first.");
            return;
        }
        const config = (0, config_1.readConfig)();
        if (!config.codeActionsEnabled || !config.typescriptCodeActionsEnabled) {
            nova.workspace.showInformativeMessage("Vue code actions are disabled in settings.");
            return;
        }
        this.ensureStarted("quick fix");
        if (!this.tsserverBridge) {
            nova.workspace.showInformativeMessage("TypeScript proxy is not running yet.");
            return;
        }
        const file = editor.document.path;
        if (!file) {
            return;
        }
        await this.syncEditorWithTsserver(editor);
        const range = editor.selectedRange;
        const start = (0, lsp_position_1.positionAt)(editor, range.start);
        const end = (0, lsp_position_1.positionAt)(editor, range.end || range.start);
        const diagnostics = (await this.collectTypeScriptDiagnostics(file));
        const errorCodes = matchingDiagnosticCodes(diagnostics, start, end);
        if (errorCodes.length === 0) {
            nova.workspace.showInformativeMessage("No TypeScript quick fixes at the cursor.");
            return;
        }
        const fixes = (await this.tsserverBridge.request("getCodeFixes", {
            file,
            startLine: start.line + 1,
            startOffset: start.character + 1,
            endLine: end.line + 1,
            endOffset: end.character + 1,
            errorCodes,
            ...(0, tsserver_types_1.tsserverEditOptions)()
        }));
        const applicableFixes = Array.isArray(fixes)
            ? fixes.filter((fix) => fix.changes.some((change) => change.textChanges.length > 0))
            : [];
        if (applicableFixes.length === 0) {
            nova.workspace.showInformativeMessage("No TypeScript quick fixes available.");
            return;
        }
        const choice = await choicePalette(applicableFixes.map((fix) => fix.description), "Choose a Vue quick fix");
        const selectedFix = choice === null ? null : applicableFixes[choice];
        if (!selectedFix) {
            return;
        }
        await (0, lsp_edits_1.applyTsserverFileEdits)(selectedFix.changes);
    }
    async addMissingImports(candidate) {
        const editor = textEditorOrActive(candidate);
        if (!editor || !(0, vue_editor_1.isVueEditor)(editor)) {
            nova.workspace.showInformativeMessage("Open a .vue editor first.");
            return;
        }
        const config = (0, config_1.readConfig)();
        if (!config.codeActionsEnabled || !config.typescriptCodeActionsEnabled) {
            nova.workspace.showInformativeMessage("Vue code actions are disabled in settings.");
            return;
        }
        this.ensureStarted("add missing imports");
        if (!this.tsserverBridge) {
            nova.workspace.showInformativeMessage("TypeScript proxy is not running yet.");
            return;
        }
        const file = editor.document.path;
        if (!file) {
            return;
        }
        await this.syncEditorWithTsserver(editor);
        const diagnostics = (await this.collectTypeScriptDiagnostics(file));
        const fixes = await this.collectImportFixes(file, diagnostics, isMissingImportFix);
        if (fixes.length === 0) {
            nova.workspace.showInformativeMessage("No missing import fixes available.");
            return;
        }
        await (0, lsp_edits_1.applyTsserverFileEdits)(mergeTsserverFileEdits(fixes.flatMap((fix) => fix.changes)));
        nova.workspace.showInformativeMessage(`Applied ${fixes.length} missing import fix(es).`);
    }
    async removeUnusedImports(candidate) {
        await this.applyOrganizeImports(candidate, false, "No unused imports to remove.");
    }
    async organizeImports(candidate) {
        await this.applyOrganizeImports(candidate, true, "Imports already organized.");
    }
    async applyOrganizeImports(candidate, skipDestructiveCodeActions, emptyMessage) {
        const editor = textEditorOrActive(candidate);
        if (!editor || !(0, vue_editor_1.isVueEditor)(editor)) {
            nova.workspace.showInformativeMessage("Open a .vue editor first.");
            return;
        }
        const config = (0, config_1.readConfig)();
        if (!config.codeActionsEnabled || !config.typescriptCodeActionsEnabled) {
            nova.workspace.showInformativeMessage("Vue code actions are disabled in settings.");
            return;
        }
        this.ensureStarted(skipDestructiveCodeActions ? "organize imports" : "remove unused imports");
        if (!this.tsserverBridge) {
            nova.workspace.showInformativeMessage("TypeScript proxy is not running yet.");
            return;
        }
        const file = editor.document.path;
        if (!file) {
            return;
        }
        await this.syncEditorWithTsserver(editor);
        const changes = (await this.tsserverBridge.request("organizeImports", {
            scope: {
                type: "file",
                args: { file }
            },
            skipDestructiveCodeActions,
            ...(0, tsserver_types_1.tsserverEditOptions)()
        }));
        if (!Array.isArray(changes) || changes.length === 0) {
            nova.workspace.showInformativeMessage(emptyMessage);
            return;
        }
        await (0, lsp_edits_1.applyTsserverFileEdits)(changes);
    }
    registerEditor(editor) {
        if ((0, vue_editor_1.isVueEditor)(editor) && !(0, workspace_paths_1.isIgnoredWorkspacePath)(editor.document.path)) {
            this.ensureStarted("vue editor opened");
        }
        return [
            editor.document.onDidChangeSyntax(() => {
                if ((0, vue_editor_1.isVueEditor)(editor) && !(0, workspace_paths_1.isIgnoredWorkspacePath)(editor.document.path)) {
                    this.ensureStarted("document syntax changed to vue");
                }
            }),
            editor.onDidStopChanging((changedEditor) => {
                if ((0, vue_editor_1.isVueEditor)(changedEditor) && !(0, workspace_paths_1.isIgnoredWorkspacePath)(changedEditor.document.path)) {
                    this.ensureStarted("vue editor changed");
                }
            }),
            editor.onDidSave((savedEditor) => {
                if ((0, vue_editor_1.isVueEditor)(savedEditor) && !(0, workspace_paths_1.isIgnoredWorkspacePath)(savedEditor.document.path)) {
                    this.ensureStarted("vue editor saved");
                }
            })
        ];
    }
    async syncEditorWithTsserver(editor) {
        if (!this.tsserverBridge || !editor.document.path) {
            return;
        }
        await this.tsserverBridge.updateVueFile(editor.document.path, (0, lsp_position_1.fullText)(editor));
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
            (0, logger_1.debug)(this.status.config, `server capabilities: ${(0, lsp_debug_1.summarizeCapabilities)(capabilities)}`);
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
    async collectImportFixes(file, diagnostics, predicate) {
        if (!this.tsserverBridge) {
            return [];
        }
        const fixes = [];
        const seen = new Set();
        for (const diagnostic of diagnostics) {
            if (diagnostic.code === undefined || !diagnostic.start || !diagnostic.end) {
                continue;
            }
            const diagnosticFixes = (await this.tsserverBridge.request("getCodeFixes", {
                file,
                startLine: diagnostic.start.line,
                startOffset: diagnostic.start.offset,
                endLine: diagnostic.end.line,
                endOffset: diagnostic.end.offset,
                errorCodes: [diagnostic.code],
                ...(0, tsserver_types_1.tsserverEditOptions)()
            }));
            if (!Array.isArray(diagnosticFixes)) {
                continue;
            }
            for (const fix of diagnosticFixes) {
                if (!predicate(fix) || !fix.changes.some((change) => change.textChanges.length > 0)) {
                    continue;
                }
                const key = JSON.stringify(fix.changes);
                if (!seen.has(key)) {
                    seen.add(key);
                    fixes.push(fix);
                }
            }
        }
        return fixes;
    }
    refreshOpenVueEditors() {
        for (const editor of nova.workspace.textEditors) {
            if ((0, vue_editor_1.isVueEditor)(editor) && !(0, workspace_paths_1.isIgnoredWorkspacePath)(editor.document.path)) {
                this.ensureStarted("vue editor refresh");
            }
        }
    }
    createClient(config, toolchain) {
        const server = toolchain.server;
        const tsdk = toolchain.tsdk;
        const proxyScript = nova.path.join(nova.extension.path, "Support", "proxy", "vue-lsp-proxy.js");
        const tsserverPath = nova.path.join(tsdk.path, "tsserver.js");
        const pluginProbeLocation = nodeModulesRoot(server.path);
        const cwd = projectRootFromTsdk(tsdk.path) || nova.workspace.path || nova.extension.path;
        const maxOldSpaceSize = this.effectiveMaxOldSpaceSize(config);
        const serverOptions = {
            path: (0, paths_1.nodeLauncher)(config),
            args: [
                ...(config.nodePath ? [] : ["node"]),
                proxyScript,
                "--vueServer",
                server.path,
                "--vueServerKind",
                server.kind,
                "--tsserver",
                tsserverPath,
                "--tsdk",
                tsdk.path,
                "--pluginProbeLocation",
                pluginProbeLocation,
                "--cwd",
                cwd,
                "--traceLsp",
                config.lspLogs ? "true" : "false"
            ],
            env: {
                NODE_OPTIONS: `--max-old-space-size=${maxOldSpaceSize}`
            },
            type: "stdio"
        };
        const syntaxes = [
            { syntax: "vue", languageId: "vue" }
        ];
        const clientOptions = {
            syntaxes,
            initializationOptions: config.initializationOptions,
            debug: config.lspLogs
        };
        (0, logger_1.debug)(config, `client syntaxes: ${(0, logger_1.formatClientSyntaxes)(syntaxes)}`);
        (0, logger_1.debug)(config, `initialization options keys: ${Object.keys(config.initializationOptions).join(", ") || "none"}`);
        (0, logger_1.debug)(config, `lsp transport: stdio`);
        (0, logger_1.debug)(config, `lsp command: ${serverOptions.path} ${serverOptions.args.join(" ")}`);
        (0, logger_1.debug)(config, `lsp proxy cwd: ${cwd}`);
        (0, logger_1.debug)(config, `node memory limit: ${maxOldSpaceSize} MB${this.temporaryMaxOldSpaceSize ? " (temporary retry)" : ""}`);
        (0, logger_1.debug)(config, `lsp logs: ${config.lspLogs ? "on" : "off"}`);
        return new LanguageClient("vue", "Vue Language Server", serverOptions, clientOptions);
    }
    registerWorkspaceConfigurationHandler(client, config) {
        client.onRequest("workspace/configuration", (params) => {
            const items = isRecord(params) && Array.isArray(params.items) ? params.items : [];
            const result = items.map((item) => {
                const section = isRecord(item) && typeof item.section === "string" ? item.section : undefined;
                return (0, config_1.resolveConfigurationSection)(section);
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
        if (!isOutOfMemoryError(lastError)) {
            return false;
        }
        const currentLimit = this.effectiveMaxOldSpaceSize(config);
        const suggestedLimit = Math.min(Math.max(currentLimit * 2, currentLimit + 1024), 8192);
        const message = `Vue language server ran out of memory. Current Node Memory Limit is ${currentLimit} MB. ` +
            `Increase Runtime & Paths > Node Memory Limit${suggestedLimit > currentLimit ? ` to ${suggestedLimit} MB or higher` : ""}.`;
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

function isOutOfMemoryError(message) {
    return /out of memory|heap out of memory|allocation failed|heap limit|oom=yes/i.test(message);
}

function nodeModulesRoot(filePath) {
    const marker = "/node_modules/";
    const index = filePath.lastIndexOf(marker);
    if (index < 0) {
        return nova.path.join(nova.extension.path, "Support", "server", "node_modules");
    }
    return filePath.slice(0, index + marker.length - 1);
}

function projectRootFromTsdk(tsdk) {
    const marker = "/node_modules/typescript/lib";
    const index = tsdk.lastIndexOf(marker);
    if (index < 0) {
        return null;
    }
    return tsdk.slice(0, index);
}

function validateNodePath(config) {
    if (!config.nodePath) {
        return null;
    }
    try {
        if (nova.fs.access(config.nodePath, nova.fs.R_OK) || nova.fs.access(config.nodePath, nova.fs.X_OK)) {
            return null;
        }
    }
    catch {
        // Fall through to the user-facing message below.
    }
    return [
        `Custom Node executable is not readable or executable: ${config.nodePath}`,
        "Choose a valid Node.js executable or clear the Node Executable setting to use /usr/bin/env node."
    ].join("\n");
}

function isRecord(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
}
async function inputPalette(prompt, value) {
    return new Promise((resolve) => {
        nova.workspace.showInputPalette(prompt, { placeholder: value, value }, resolve);
    });
}
async function choicePalette(choices, placeholder) {
    return new Promise((resolve) => {
        nova.workspace.showChoicePalette(choices, { placeholder }, (_choice, index) => {
            resolve(typeof index === "number" && index >= 0 && index < choices.length ? index : null);
        });
    });
}

function matchingDiagnosticCodes(diagnostics, start, end) {
    const codes = [];
    for (const diagnostic of diagnostics) {
        if (diagnostic.code === undefined || !diagnostic.start || !diagnostic.end) {
            continue;
        }
        const diagnosticStart = (0, lsp_position_1.tsPositionToLsp)(diagnostic.start);
        const diagnosticEnd = (0, lsp_position_1.tsPositionToLsp)(diagnostic.end);
        if ((0, lsp_position_1.rangesOverlap)(diagnosticStart, diagnosticEnd, start, end) && !codes.includes(diagnostic.code)) {
            codes.push(diagnostic.code);
        }
    }
    return codes;
}

function isMissingImportFix(fix) {
    const text = `${fix.fixName || ""} ${fix.fixId || ""} ${fix.description || ""}`.toLowerCase();
    return (text.includes("add import") ||
        text.includes("add missing import") ||
        text.includes("import from") ||
        text.includes("fix missing import"));
}

function mergeTsserverFileEdits(changes) {
    const byFile = new Map();
    for (const change of changes) {
        const existing = byFile.get(change.fileName);
        if (existing) {
            existing.textChanges.push(...change.textChanges);
        }
        else {
            byFile.set(change.fileName, {
                fileName: change.fileName,
                textChanges: [...change.textChanges]
            });
        }
    }
    return [...byFile.values()];
}

function textEditorOrActive(candidate) {
    if (candidate && typeof candidate === "object" && "document" in candidate) {
        return candidate;
    }
    return nova.workspace.activeTextEditor ?? null;
}
