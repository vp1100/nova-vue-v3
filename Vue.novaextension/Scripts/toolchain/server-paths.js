"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveServer = resolveServer;
const paths_1 = require("../workspace/paths");
const roots_1 = require("./roots");
function resolveServer(config, errors) {
    if (config.serverPath) {
        if ((0, paths_1.isReadable)(config.serverPath) || (0, paths_1.isExecutable)(config.serverPath)) {
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
    for (const root of (0, roots_1.toolchainRoots)(config)) {
        for (const candidate of workspaceServerCandidates(root)) {
            if ((0, paths_1.isReadable)(candidate) || (0, paths_1.isExecutable)(candidate)) {
                return {
                    path: candidate,
                    source: "workspace",
                    kind: isJavaScript(candidate) ? "script" : "executable"
                };
            }
        }
    }
    const bundled = bundledServerScript();
    if ((0, paths_1.isReadable)(bundled)) {
        return {
            path: bundled,
            source: "bundled",
            kind: "script"
        };
    }
    const roots = (0, roots_1.toolchainRoots)(config);
    errors.push([
        "Vue language server was not found.",
        roots.length > 0 ? `Searched project roots: ${roots.join(", ")}` : "No Nova workspace root is available.",
        "Expected workspace dependency: node_modules/@vue/language-server/bin/vue-language-server.js",
        `Expected bundled fallback: ${bundled}`,
        (0, paths_1.exists)(bundledServerPackage())
            ? "Bundled @vue/language-server package exists, but the executable was not readable."
            : "Bundled fallback is missing. Run: npm ci --omit=dev --prefix Vue.novaextension/Support/server"
    ].join("\n"));
    return null;
}
function isJavaScript(path) {
    return path.endsWith(".js") || path.endsWith(".cjs") || path.endsWith(".mjs");
}
function bundledServerScript() {
    return (0, paths_1.joinPath)(nova.extension.path, "Support", "server", "node_modules", "@vue", "language-server", "bin", "vue-language-server.js");
}
function bundledServerPackage() {
    return (0, paths_1.joinPath)(nova.extension.path, "Support", "server", "node_modules", "@vue", "language-server", "package.json");
}
function workspaceServerCandidates(root) {
    return [
        (0, paths_1.joinPath)(root, "node_modules", "@vue", "language-server", "bin", "vue-language-server.js"),
        (0, paths_1.joinPath)(root, "node_modules", ".bin", "vue-language-server")
    ];
}
