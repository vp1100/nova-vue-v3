"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveToolchain = resolveToolchain;
exports.invalidateToolchainCache = invalidateToolchainCache;
exports.nodeLauncher = nodeLauncher;

const workspace_paths_1 = require("./workspace-paths");

let cachedToolchainKey = null;
let cachedToolchain = null;

function isJavaScript(path) {
    return path.endsWith(".js") || path.endsWith(".cjs") || path.endsWith(".mjs");
}

function validTsdk(path) {
    return (0, workspace_paths_1.isReadable)((0, workspace_paths_1.joinPath)(path, "typescript.js")) && (0, workspace_paths_1.isReadable)((0, workspace_paths_1.joinPath)(path, "tsserverlibrary.js"));
}

function workspacePath() {
    return nova.workspace.path ?? null;
}

function activeDocumentPath() {
    return nova.workspace.activeTextEditor?.document.path ?? null;
}

function openVueDocumentPaths() {
    return nova.workspace.textDocuments
        .filter((document) => document.syntax === "vue" && typeof document.path === "string" && !(0, workspace_paths_1.isIgnoredWorkspacePath)(document.path))
        .map((document) => document.path);
}

function pushUnique(paths, path) {
    if (!paths.includes(path)) {
        paths.push(path);
    }
}

function toolchainRoots(config) {
    const roots = [];
    const root = workspacePath();
    if (!root) {
        return roots;
    }
    if (!config.workspaceDiscoveryEnabled) {
        return [root];
    }
    const activePath = activeDocumentPath();
    if (activePath && (0, workspace_paths_1.containsPath)(root, activePath) && !(0, workspace_paths_1.isIgnoredWorkspacePath)(activePath)) {
        for (const candidate of (0, workspace_paths_1.nearestProjectRootsFromFile)(activePath, root)) {
            pushUnique(roots, candidate);
        }
    }
    for (const documentPath of openVueDocumentPaths()) {
        if (!(0, workspace_paths_1.containsPath)(root, documentPath)) {
            continue;
        }
        for (const candidate of (0, workspace_paths_1.nearestProjectRootsFromFile)(documentPath, root)) {
            pushUnique(roots, candidate);
        }
    }
    pushUnique(roots, root);
    return roots;
}

function bundledServerScript() {
    return (0, workspace_paths_1.joinPath)(nova.extension.path, "Support", "server", "node_modules", "@vue", "language-server", "bin", "vue-language-server.js");
}

function bundledServerPackage() {
    return (0, workspace_paths_1.joinPath)(nova.extension.path, "Support", "server", "node_modules", "@vue", "language-server", "package.json");
}

function bundledTsdk() {
    return (0, workspace_paths_1.joinPath)(nova.extension.path, "Support", "server", "node_modules", "typescript", "lib");
}

function workspaceServerCandidates(root) {
    return [
        (0, workspace_paths_1.joinPath)(root, "node_modules", "@vue", "language-server", "bin", "vue-language-server.js"),
        (0, workspace_paths_1.joinPath)(root, "node_modules", ".bin", "vue-language-server")
    ];
}

function workspaceTsdk(root) {
    return (0, workspace_paths_1.joinPath)(root, "node_modules", "typescript", "lib");
}

function resolveServer(config, errors) {
    if (config.serverPath) {
        if ((0, workspace_paths_1.isReadable)(config.serverPath) || (0, workspace_paths_1.isExecutable)(config.serverPath)) {
            return {
                path: config.serverPath,
                source: "custom",
                kind: isJavaScript(config.serverPath) ? "script" : "executable"
            };
        }
        errors.push([
            `Custom Vue language server path is not readable: ${config.serverPath}`,
            "Choose the @vue/language-server bin/vue-language-server.js file or clear the setting to use workspace/bundled resolution."
        ].join("\n"));
        return null;
    }
    for (const root of toolchainRoots(config)) {
        for (const candidate of workspaceServerCandidates(root)) {
            if ((0, workspace_paths_1.isReadable)(candidate) || (0, workspace_paths_1.isExecutable)(candidate)) {
                return {
                    path: candidate,
                    source: "workspace",
                    kind: isJavaScript(candidate) ? "script" : "executable"
                };
            }
        }
    }
    const bundled = bundledServerScript();
    if ((0, workspace_paths_1.isReadable)(bundled)) {
        return {
            path: bundled,
            source: "bundled",
            kind: "script"
        };
    }
    const roots = toolchainRoots(config);
    errors.push([
        "Vue language server was not found.",
        roots.length > 0 ? `Searched project roots: ${roots.join(", ")}` : "No Nova workspace root is available.",
        "Expected workspace dependency: node_modules/@vue/language-server/bin/vue-language-server.js",
        `Expected bundled fallback: ${bundled}`,
        (0, workspace_paths_1.exists)(bundledServerPackage())
            ? "Bundled @vue/language-server package exists, but the executable was not readable."
            : "Bundled fallback is missing. Run: npm ci --omit=dev --prefix Vue.novaextension/Support/server"
    ].join("\n"));
    return null;
}

function resolveBundledTsdk() {
    const bundled = bundledTsdk();
    if (validTsdk(bundled)) {
        return {
            path: bundled,
            source: "bundled"
        };
    }
    return null;
}

function resolveTsdk(config, errors, options) {
    if (config.tsdk) {
        if (validTsdk(config.tsdk)) {
            return {
                path: config.tsdk,
                source: "custom"
            };
        }
        errors.push([
            `Custom TypeScript SDK is invalid: ${config.tsdk}`,
            "The TypeScript SDK setting must point to a lib directory containing typescript.js and tsserverlibrary.js."
        ].join("\n"));
        return null;
    }
    if (options.preferBundledTsdk) {
        const bundled = resolveBundledTsdk();
        if (bundled) {
            return bundled;
        }
        errors.push([
            "Bundled TypeScript SDK fallback was requested but is not valid.",
            `Expected bundled SDK: ${bundledTsdk()}`,
            "Run: npm ci --omit=dev --prefix Vue.novaextension/Support/server"
        ].join("\n"));
    }
    for (const root of toolchainRoots(config)) {
        const candidate = workspaceTsdk(root);
        if (validTsdk(candidate)) {
            return {
                path: candidate,
                source: "workspace"
            };
        }
        if ((0, workspace_paths_1.exists)(candidate)) {
            errors.push([
                `Workspace TypeScript SDK is incomplete: ${candidate}`,
                "Expected typescript.js and tsserverlibrary.js inside the lib directory. Falling back if possible."
            ].join("\n"));
        }
    }
    const bundled = resolveBundledTsdk();
    if (bundled) {
        return bundled;
    }
    const roots = toolchainRoots(config);
    errors.push([
        "No valid TypeScript SDK found.",
        roots.length > 0 ? `Searched project roots: ${roots.join(", ")}` : "No Nova workspace root is available.",
        "Expected workspace dependency: node_modules/typescript/lib/typescript.js and tsserverlibrary.js",
        `Expected bundled fallback: ${bundledTsdk()}`,
        "Install typescript in the workspace or run: npm ci --omit=dev --prefix Vue.novaextension/Support/server"
    ].join("\n"));
    return null;
}

function resolveToolchain(config, options = {}) {
    const cacheKey = toolchainCacheKey(config, options);
    if (cachedToolchain && cachedToolchainKey === cacheKey) {
        return cachedToolchain;
    }
    const errors = [];
    const hints = [];
    const server = resolveServer(config, errors);
    const tsdk = resolveTsdk(config, errors, options);
    hints.push("Global vue-language-server and global TypeScript are intentionally not used automatically.");
    const roots = toolchainRoots(config);
    if (roots.length > 0) {
        hints.push(`Toolchain search roots: ${roots.join(", ")}`);
    }
    cachedToolchainKey = cacheKey;
    cachedToolchain = {
        server,
        tsdk,
        errors,
        hints
    };
    return cachedToolchain;
}

function invalidateToolchainCache() {
    cachedToolchainKey = null;
    cachedToolchain = null;
}

function nodeLauncher(config) {
    return config.nodePath || "/usr/bin/env";
}

function toolchainCacheKey(config, options) {
    const root = workspacePath();
    const activePath = activeDocumentPath();
    const openVuePaths = openVueDocumentPaths().sort();
    return JSON.stringify({
        root,
        activePath,
        openVuePaths,
        serverPath: config.serverPath,
        tsdk: config.tsdk,
        preferBundledTsdk: options.preferBundledTsdk === true
    });
}
