"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TsserverBridge = void 0;
exports.createTsserverResponseParams = createTsserverResponseParams;

const logger_1 = require("./logger");
const workspace_paths_1 = require("./workspace-paths");

class TsserverBridge {
    constructor(config) {
        this.config = config;
        this.client = null;
        this.requestCount = 0;
        this.errorCount = 0;
        this.bridgePath = null;
    }
    get status() {
        return {
            running: this.client !== null,
            requestCount: this.requestCount,
            errorCount: this.errorCount,
            path: this.bridgePath
        };
    }
    prepareProxy() {
        this.bridgePath = nova.path.join(nova.extension.path, "Support", "proxy", "vue-lsp-proxy.js");
    }
    stop() {
        this.client = null;
    }
    attach(client) {
        this.client = client;
    }
    async updateVueFile(file, content) {
        if (!this.client) {
            throw new Error("tsserver proxy is not running");
        }
        await this.client.sendRequest("vue/updateOpenFile", { file, content });
    }
    async request(command, args) {
        if (!this.client) {
            throw new Error("tsserver proxy is not running");
        }
        this.requestCount += 1;
        const startedAt = Date.now();
        const result = await this.client.sendRequest("vue/tsserverRequest", { command, args });
        this.logRequest(command, args, result, Date.now() - startedAt);
        return result;
    }
    logRequest(command, args, result, durationMs, upstreamId) {
        const file = requestFile(args);
        const fileLabel = file ? (0, workspace_paths_1.relativeWorkspacePath)(file) : "workspace";
        const prefix = upstreamId ? `TS proxy #${upstreamId}` : "TS proxy";
        if (command === "_vue:projectInfo") {
            const configFileName = projectInfoConfig(result);
            const configLabel = configFileName ? (0, workspace_paths_1.relativeWorkspacePath)(configFileName) : "none";
            (0, logger_1.lspDebug)(this.config, `${prefix}: projectInfo ${fileLabel} -> ${configLabel}, ${durationMs}ms`);
            if (configFileName?.includes("/dev/null/inferredProject")) {
                (0, logger_1.warn)(`TS project inferred for ${fileLabel}; TypeScript diagnostics for Vue files may be incomplete`);
            }
            return;
        }
        if (command.endsWith("DiagnosticsSync")) {
            const summary = summarizeTsserverDiagnostics(result);
            (0, logger_1.lspDebug)(this.config, `${prefix}: ${diagnosticsKind(command)} ${fileLabel} -> ${summary}, ${durationMs}ms`);
            return;
        }
        (0, logger_1.lspDebug)(this.config, `${prefix}: ${command} ${fileLabel}, ${durationMs}ms`);
    }
}
exports.TsserverBridge = TsserverBridge;

function createTsserverResponseParams(id, result) {
    return [[id, result]];
}

function requestFile(args) {
    if (args && typeof args === "object" && typeof args.file === "string") {
        return args.file;
    }
    return null;
}

function projectInfoConfig(result) {
    if (result && typeof result === "object" && typeof result.configFileName === "string") {
        return result.configFileName;
    }
    return null;
}

function diagnosticsKind(command) {
    if (command === "semanticDiagnosticsSync") {
        return "semantic diagnostics";
    }
    if (command === "syntacticDiagnosticsSync") {
        return "syntactic diagnostics";
    }
    if (command === "suggestionDiagnosticsSync") {
        return "suggestion diagnostics";
    }
    return command;
}

function summarizeTsserverDiagnostics(result) {
    if (!Array.isArray(result) || result.length === 0) {
        return "clean";
    }
    let errors = 0;
    let warnings = 0;
    let suggestions = 0;
    let infos = 0;
    const codes = [];
    for (const diagnostic of result) {
        const category = diagnostic && typeof diagnostic === "object" ? diagnostic.category : undefined;
        if (category === "error") {
            errors += 1;
        }
        else if (category === "warning") {
            warnings += 1;
        }
        else if (category === "suggestion") {
            suggestions += 1;
        }
        else {
            infos += 1;
        }
        const code = diagnostic && typeof diagnostic === "object" ? diagnostic.code : undefined;
        if (code !== undefined && !codes.includes(code)) {
            codes.push(code);
        }
    }
    const parts = [
        `${result.length} issue(s)`,
        `${errors} error(s)`,
        `${warnings} warning(s)`,
        `${suggestions} hint(s)`
    ];
    if (infos > 0) {
        parts.push(`${infos} info`);
    }
    if (codes.length > 0) {
        parts.push(`codes: ${codes.map((code) => `TS${code}`).join(", ")}`);
    }
    return parts.join(", ");
}
