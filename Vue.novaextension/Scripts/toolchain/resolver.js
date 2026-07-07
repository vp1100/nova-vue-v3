"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveToolchain = resolveToolchain;
exports.nodeLauncher = nodeLauncher;
const cache_1 = require("./cache");
const roots_1 = require("./roots");
const server_paths_1 = require("./server-paths");
const tsdk_1 = require("./tsdk");
function resolveToolchain(config, options = {}) {
    const cacheKey = (0, cache_1.toolchainCacheKey)(config, options);
    const cached = (0, cache_1.readCachedToolchain)(cacheKey);
    if (cached) {
        return cached;
    }
    const errors = [];
    const hints = [];
    const server = (0, server_paths_1.resolveServer)(config, errors);
    const tsdk = (0, tsdk_1.resolveTsdk)(config, errors, options);
    hints.push("Global vue-language-server and global TypeScript are intentionally not used automatically.");
    const roots = (0, roots_1.toolchainRoots)(config);
    if (roots.length > 0) {
        hints.push(`Toolchain search roots: ${roots.join(", ")}`);
    }
    return (0, cache_1.writeCachedToolchain)(cacheKey, {
        server,
        tsdk,
        errors,
        hints
    });
}
function nodeLauncher(config) {
    return config.nodePath || "/usr/bin/env";
}
