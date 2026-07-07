"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.workspacePath = workspacePath;
exports.activeDocumentPath = activeDocumentPath;
exports.openVueDocumentPaths = openVueDocumentPaths;
exports.toolchainRoots = toolchainRoots;
const paths_1 = require("../workspace/paths");
function workspacePath() {
    return nova.workspace.path ?? null;
}
function activeDocumentPath() {
    return nova.workspace.activeTextEditor?.document.path ?? null;
}
function openVueDocumentPaths() {
    return nova.workspace.textDocuments
        .filter((document) => document.syntax === "vue" && typeof document.path === "string" && !(0, paths_1.isIgnoredWorkspacePath)(document.path))
        .map((document) => document.path);
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
    if (activePath && (0, paths_1.containsPath)(root, activePath) && !(0, paths_1.isIgnoredWorkspacePath)(activePath)) {
        for (const candidate of (0, paths_1.nearestProjectRootsFromFile)(activePath, root)) {
            pushUnique(roots, candidate);
        }
    }
    for (const documentPath of openVueDocumentPaths()) {
        if (!(0, paths_1.containsPath)(root, documentPath)) {
            continue;
        }
        for (const candidate of (0, paths_1.nearestProjectRootsFromFile)(documentPath, root)) {
            pushUnique(roots, candidate);
        }
    }
    pushUnique(roots, root);
    return roots;
}
function pushUnique(paths, path) {
    if (!paths.includes(path)) {
        paths.push(path);
    }
}
