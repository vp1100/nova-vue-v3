"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatVueLanguageServerVersion = formatVueLanguageServerVersion;
exports.formatTypeScriptVersion = formatTypeScriptVersion;
const paths_1 = require("../workspace/paths");
const environment_1 = require("./environment");
function formatVueLanguageServerVersion(server, projectRoot) {
    if (server) {
        const version = packageVersion(serverPackageJsonPath(server, projectRoot));
        return version ? `${version} (${server.source})` : `unknown (${server.source})`;
    }
    const projectVersion = projectRoot ? packageVersion((0, paths_1.joinPath)(projectRoot, "node_modules", "@vue", "language-server", "package.json")) : null;
    if (projectVersion) {
        return `${projectVersion} (workspace available)`;
    }
    const bundledVersion = packageVersion((0, paths_1.joinPath)(nova.extension.path, "Support", "server", "node_modules", "@vue", "language-server", "package.json"));
    return bundledVersion ? `${bundledVersion} (bundled available)` : "not resolved";
}
function formatTypeScriptVersion(tsdk, projectRoot) {
    if (tsdk) {
        const version = packageVersion(tsdkPackageJsonPath(tsdk, projectRoot));
        return version ? `${version} (${tsdk.source})` : `unknown (${tsdk.source})`;
    }
    const projectVersion = projectRoot ? packageVersion((0, paths_1.joinPath)(projectRoot, "node_modules", "typescript", "package.json")) : null;
    if (projectVersion) {
        return `${projectVersion} (workspace available)`;
    }
    const bundledVersion = packageVersion((0, paths_1.joinPath)(nova.extension.path, "Support", "server", "node_modules", "typescript", "package.json"));
    return bundledVersion ? `${bundledVersion} (bundled available)` : "not resolved";
}
function serverPackageJsonPath(server, projectRoot) {
    const marker = "/node_modules/@vue/language-server/";
    const index = server.path.indexOf(marker);
    if (index >= 0) {
        return `${server.path.slice(0, index + marker.length - 1)}/package.json`;
    }
    if (server.source === "workspace" && projectRoot) {
        return (0, paths_1.joinPath)(projectRoot, "node_modules", "@vue", "language-server", "package.json");
    }
    if (server.source === "bundled") {
        return (0, paths_1.joinPath)(nova.extension.path, "Support", "server", "node_modules", "@vue", "language-server", "package.json");
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
        return (0, paths_1.joinPath)(projectRoot, "node_modules", "typescript", "package.json");
    }
    if (tsdk.source === "bundled") {
        return (0, paths_1.joinPath)(nova.extension.path, "Support", "server", "node_modules", "typescript", "package.json");
    }
    return null;
}
function packageVersion(packageJsonPath) {
    if (!packageJsonPath) {
        return null;
    }
    const text = (0, environment_1.readTextFile)(packageJsonPath);
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
