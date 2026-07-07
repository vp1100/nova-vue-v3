"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readCachedToolchain = readCachedToolchain;
exports.writeCachedToolchain = writeCachedToolchain;
exports.invalidateToolchainCache = invalidateToolchainCache;
exports.toolchainCacheKey = toolchainCacheKey;
const roots_1 = require("./roots");
let cachedToolchainKey = null;
let cachedToolchain = null;
function readCachedToolchain(cacheKey) {
    return cachedToolchain && cachedToolchainKey === cacheKey ? cachedToolchain : null;
}
function writeCachedToolchain(cacheKey, toolchain) {
    cachedToolchainKey = cacheKey;
    cachedToolchain = toolchain;
    return cachedToolchain;
}
function invalidateToolchainCache() {
    cachedToolchainKey = null;
    cachedToolchain = null;
}
function toolchainCacheKey(config, options) {
    const root = (0, roots_1.workspacePath)();
    const activePath = (0, roots_1.activeDocumentPath)();
    const openVuePaths = (0, roots_1.openVueDocumentPaths)().sort();
    return JSON.stringify({
        root,
        activePath,
        openVuePaths,
        serverPath: config.serverPath,
        tsdk: config.tsdk,
        preferBundledTsdk: options.preferBundledTsdk === true
    });
}
