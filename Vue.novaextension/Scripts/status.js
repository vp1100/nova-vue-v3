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
        return {
            lines: ["Workspace: none", "Vue project root: none"],
            projectRoot: null
        };
    }
    const projectRoot = vuePath && (0, workspace_paths_1.containsPath)(root, vuePath) ? (0, workspace_paths_1.nearestProjectRoot)(vuePath, root) ?? root : root;
    return {
        lines: [
            `Workspace: ${root}`,
            `Vue file: ${vuePath ?? "none"}`,
            `Vue project root: ${projectRoot}`,
            `Project package.json: ${(0, workspace_paths_1.exists)((0, workspace_paths_1.joinPath)(projectRoot, "package.json")) ? "yes" : "no"}`,
            `Project tsconfig: ${(0, workspace_paths_1.exists)((0, workspace_paths_1.joinPath)(projectRoot, "tsconfig.json")) ? "yes" : "no"}`,
            `Project jsconfig: ${(0, workspace_paths_1.exists)((0, workspace_paths_1.joinPath)(projectRoot, "jsconfig.json")) ? "yes" : "no"}`,
            `Project Vue dependency: ${(0, workspace_paths_1.exists)((0, workspace_paths_1.joinPath)(projectRoot, "node_modules", "vue", "package.json")) ? "yes" : "no"}`,
            `Project TypeScript dependency: ${(0, workspace_paths_1.exists)((0, workspace_paths_1.joinPath)(projectRoot, "node_modules", "typescript", "package.json")) ? "yes" : "no"}`
        ],
        projectRoot
    };
}

function formatStatus(status) {
    const toolchain = status.toolchain;
    const config = status.config;
    const project = formatProjectStatus();
    return [
        `Vue language server: ${status.state}`,
        `Running: ${status.running ? "yes" : "no"}`,
        `Lazy start: ${status.lazyStart ? "waiting for .vue file" : "started"}`,
        `Nova version: ${formatNovaVersion()}`,
        `macOS version: ${formatMacOSVersion()}`,
        ...project.lines,
        `Server: ${toolchain?.server ? `${toolchain.server.path} (${toolchain.server.source})` : "not resolved"}`,
        `Vue language server version: ${formatVueLanguageServerVersion(toolchain?.server ?? null, project.projectRoot)}`,
        `TypeScript SDK: ${toolchain?.tsdk ? `${toolchain.tsdk.path} (${toolchain.tsdk.source})` : "not resolved"}`,
        `TypeScript version: ${formatTypeScriptVersion(toolchain?.tsdk ?? null, project.projectRoot)}`,
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

function formatNovaVersion() {
    const api = nova;
    if (typeof api.version === "string" && api.version.trim()) {
        return api.version;
    }
    if (typeof api.appVersion === "string" && api.appVersion.trim()) {
        return api.appVersion;
    }
    for (const path of [
        "/Applications/Nova.app/Contents/Info.plist",
        "/Applications/Nova Beta.app/Contents/Info.plist",
        "/Applications/Setapp/Nova.app/Contents/Info.plist"
    ]) {
        const version = matchPlistString(readTextFile(path), "CFBundleShortVersionString");
        if (version) {
            return version;
        }
    }
    return "unknown";
}

function formatMacOSVersion() {
    const text = readTextFile("/System/Library/CoreServices/SystemVersion.plist");
    const version = matchPlistString(text, "ProductUserVisibleVersion") ?? matchPlistString(text, "ProductVersion");
    return version ?? "unknown";
}

function formatVueLanguageServerVersion(server, projectRoot) {
    if (server) {
        const version = packageVersion(serverPackageJsonPath(server, projectRoot));
        return version ? `${version} (${server.source})` : `unknown (${server.source})`;
    }
    const projectVersion = projectRoot ? packageVersion((0, workspace_paths_1.joinPath)(projectRoot, "node_modules", "@vue", "language-server", "package.json")) : null;
    if (projectVersion) {
        return `${projectVersion} (workspace available)`;
    }
    const bundledVersion = packageVersion((0, workspace_paths_1.joinPath)(nova.extension.path, "Support", "server", "node_modules", "@vue", "language-server", "package.json"));
    return bundledVersion ? `${bundledVersion} (bundled available)` : "not resolved";
}

function formatTypeScriptVersion(tsdk, projectRoot) {
    if (tsdk) {
        const version = packageVersion(tsdkPackageJsonPath(tsdk, projectRoot));
        return version ? `${version} (${tsdk.source})` : `unknown (${tsdk.source})`;
    }
    const projectVersion = projectRoot ? packageVersion((0, workspace_paths_1.joinPath)(projectRoot, "node_modules", "typescript", "package.json")) : null;
    if (projectVersion) {
        return `${projectVersion} (workspace available)`;
    }
    const bundledVersion = packageVersion((0, workspace_paths_1.joinPath)(nova.extension.path, "Support", "server", "node_modules", "typescript", "package.json"));
    return bundledVersion ? `${bundledVersion} (bundled available)` : "not resolved";
}

function serverPackageJsonPath(server, projectRoot) {
    const marker = "/node_modules/@vue/language-server/";
    const index = server.path.indexOf(marker);
    if (index >= 0) {
        return `${server.path.slice(0, index + marker.length - 1)}/package.json`;
    }
    if (server.source === "workspace" && projectRoot) {
        return (0, workspace_paths_1.joinPath)(projectRoot, "node_modules", "@vue", "language-server", "package.json");
    }
    if (server.source === "bundled") {
        return (0, workspace_paths_1.joinPath)(nova.extension.path, "Support", "server", "node_modules", "@vue", "language-server", "package.json");
    }
    return null;
}

function tsdkPackageJsonPath(tsdk, projectRoot) {
    const marker = "/node_modules/typescript/lib";
    const index = tsdk.path.indexOf(marker);
    if (index >= 0) {
        return `${tsdk.path.slice(0, index + marker.length - 4)}/package.json`;
    }
    if (tsdk.source === "workspace" && projectRoot) {
        return (0, workspace_paths_1.joinPath)(projectRoot, "node_modules", "typescript", "package.json");
    }
    if (tsdk.source === "bundled") {
        return (0, workspace_paths_1.joinPath)(nova.extension.path, "Support", "server", "node_modules", "typescript", "package.json");
    }
    return null;
}

function packageVersion(packageJsonPath) {
    if (!packageJsonPath) {
        return null;
    }
    const text = readTextFile(packageJsonPath);
    if (!text) {
        return null;
    }
    try {
        const parsed = JSON.parse(text);
        return typeof parsed.version === "string" && parsed.version.trim() ? parsed.version : null;
    }
    catch {
        return null;
    }
}

function readTextFile(path) {
    try {
        const file = nova.fs.open(path);
        try {
            return file.read();
        }
        finally {
            file.close();
        }
    }
    catch {
        return null;
    }
}

function matchPlistString(text, key) {
    if (!text) {
        return null;
    }
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = text.match(new RegExp(`<key>\\s*${escaped}\\s*<\\/key>\\s*<string>\\s*([^<]+)\\s*<\\/string>`));
    return match?.[1]?.trim() || null;
}

function formatCapabilitySummary(capabilities) {
    if (!capabilities) {
        return "unknown";
    }
    const supported = [
        ["completion", capabilities.completionProvider],
        ["hover", capabilities.hoverProvider],
        ["definition", capabilities.definitionProvider],
        ["implementation", capabilities.implementationProvider],
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
