"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInitialStatus = createInitialStatus;
exports.formatStatus = formatStatus;

const workspace_paths_1 = require("./workspace-paths");

function createInitialStatus() {
    return {
        running: false,
        state: "idle",
        lazyStart: true,
        lastError: null,
        lastRestartReason: null,
        fallbackRestartUsed: false,
        diagnostics: "waiting",
        toolchain: null,
        config: null,
        tsserverBridge: null,
        capabilities: null
    };
}

function activeVuePath() {
    const active = nova.workspace.activeTextEditor?.document;
    if (active?.syntax === "vue" && typeof active.path === "string" && !(0, workspace_paths_1.isIgnoredWorkspacePath)(active.path)) {
        return active.path;
    }
    const document = nova.workspace.textDocuments.find((item) => item.syntax === "vue" && typeof item.path === "string" && !(0, workspace_paths_1.isIgnoredWorkspacePath)(item.path));
    return document?.path ?? null;
}

function formatProjectStatus() {
    const root = nova.workspace.path ?? null;
    const vuePath = activeVuePath();
    if (!root) {
        return ["Workspace: none", "Vue project root: none"];
    }
    const projectRoot = vuePath && (0, workspace_paths_1.containsPath)(root, vuePath) ? (0, workspace_paths_1.nearestProjectRoot)(vuePath, root) ?? root : root;
    return [
        `Workspace: ${root}`,
        `Vue file: ${vuePath ?? "none"}`,
        `Vue project root: ${projectRoot}`,
        `Project package.json: ${(0, workspace_paths_1.exists)((0, workspace_paths_1.joinPath)(projectRoot, "package.json")) ? "yes" : "no"}`,
        `Project tsconfig: ${(0, workspace_paths_1.exists)((0, workspace_paths_1.joinPath)(projectRoot, "tsconfig.json")) ? "yes" : "no"}`,
        `Project jsconfig: ${(0, workspace_paths_1.exists)((0, workspace_paths_1.joinPath)(projectRoot, "jsconfig.json")) ? "yes" : "no"}`,
        `Project Vue dependency: ${(0, workspace_paths_1.exists)((0, workspace_paths_1.joinPath)(projectRoot, "node_modules", "vue", "package.json")) ? "yes" : "no"}`,
        `Project TypeScript dependency: ${(0, workspace_paths_1.exists)((0, workspace_paths_1.joinPath)(projectRoot, "node_modules", "typescript", "package.json")) ? "yes" : "no"}`
    ];
}

function formatStatus(status) {
    const toolchain = status.toolchain;
    const config = status.config;
    return [
        `Vue language server: ${status.state}`,
        `Running: ${status.running ? "yes" : "no"}`,
        `Lazy start: ${status.lazyStart ? "waiting for .vue file" : "started"}`,
        ...formatProjectStatus(),
        `Server: ${toolchain?.server ? `${toolchain.server.path} (${toolchain.server.source})` : "not resolved"}`,
        `TypeScript SDK: ${toolchain?.tsdk ? `${toolchain.tsdk.path} (${toolchain.tsdk.source})` : "not resolved"}`,
        `Registered syntaxes: vue`,
        `Debug logs: ${config?.debug ? "on" : "off"}`,
        `LSP logs: ${config?.lspLogs ? "on" : "off"}`,
        `LSP capabilities: ${formatCapabilitySummary(status.capabilities)}`,
        `TS proxy: ${status.tsserverBridge?.running ? "running" : "stopped"}`,
        `TS proxy requests: ${status.tsserverBridge?.requestCount ?? 0}`,
        `TS proxy errors: ${status.tsserverBridge?.errorCount ?? 0}`,
        `LSP diagnostics: ${status.diagnostics}`,
        `Memory: ${config?.maxOldSpaceSize ?? 2048} MB`,
        `Last restart: ${status.lastRestartReason ?? "none"}`,
        `Last error: ${status.lastError ?? "none"}`,
        `Hints: ${toolchain?.hints.join(" ") ?? "none"}`,
        `Errors: ${toolchain?.errors.join(" ") ?? "none"}`
    ].join("\n");
}

function formatCapabilitySummary(capabilities) {
    if (!capabilities) {
        return "unknown";
    }
    const supported = [
        ["completion", capabilities.completionProvider],
        ["hover", capabilities.hoverProvider],
        ["definition", capabilities.definitionProvider],
        ["references", capabilities.referencesProvider],
        ["rename", capabilities.renameProvider],
        ["codeAction", capabilities.codeActionProvider],
        ["formatting", capabilities.documentFormattingProvider],
        ["inlayHint", capabilities.inlayHintProvider],
        ["signatureHelp", capabilities.signatureHelpProvider],
        ["semanticTokens", capabilities.semanticTokensProvider]
    ]
        .filter(([, value]) => Boolean(value))
        .map(([name]) => name);
    return supported.length > 0 ? supported.join(", ") : "none advertised";
}
