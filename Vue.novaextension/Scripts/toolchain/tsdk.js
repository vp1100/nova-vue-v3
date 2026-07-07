"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveTsdk = resolveTsdk;
const paths_1 = require("../workspace/paths");
const roots_1 = require("./roots");
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
    for (const root of (0, roots_1.toolchainRoots)(config)) {
        const candidate = workspaceTsdk(root);
        if (validTsdk(candidate)) {
            return {
                path: candidate,
                source: "workspace"
            };
        }
        if ((0, paths_1.exists)(candidate)) {
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
    const roots = (0, roots_1.toolchainRoots)(config);
    errors.push([
        "No valid TypeScript SDK found.",
        roots.length > 0 ? `Searched project roots: ${roots.join(", ")}` : "No Nova workspace root is available.",
        "Expected workspace dependency: node_modules/typescript/lib/typescript.js and tsserverlibrary.js",
        `Expected bundled fallback: ${bundledTsdk()}`,
        "Install typescript in the workspace or run: npm ci --omit=dev --prefix Vue.novaextension/Support/server"
    ].join("\n"));
    return null;
}
function validTsdk(path) {
    return (0, paths_1.isReadable)((0, paths_1.joinPath)(path, "typescript.js")) && (0, paths_1.isReadable)((0, paths_1.joinPath)(path, "tsserverlibrary.js"));
}
function bundledTsdk() {
    return (0, paths_1.joinPath)(nova.extension.path, "Support", "server", "node_modules", "typescript", "lib");
}
function workspaceTsdk(root) {
    return (0, paths_1.joinPath)(root, "node_modules", "typescript", "lib");
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
