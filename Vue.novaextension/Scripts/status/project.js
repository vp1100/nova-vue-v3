"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatProjectStatus = formatProjectStatus;
const paths_1 = require("../workspace/paths");
function formatProjectStatus() {
    const root = nova.workspace.path ?? null;
    const vuePath = activeVuePath();
    if (!root) {
        return {
            lines: ["Workspace: none", "Vue project root: none"],
            projectRoot: null
        };
    }
    const projectRoot = vuePath && (0, paths_1.containsPath)(root, vuePath) ? (0, paths_1.nearestProjectRoot)(vuePath, root) ?? root : root;
    return {
        lines: [
            `Workspace: ${root}`,
            `Vue file: ${vuePath ?? "none"}`,
            `Vue project root: ${projectRoot}`,
            `Project package.json: ${(0, paths_1.exists)((0, paths_1.joinPath)(projectRoot, "package.json")) ? "yes" : "no"}`,
            `Project tsconfig: ${(0, paths_1.exists)((0, paths_1.joinPath)(projectRoot, "tsconfig.json")) ? "yes" : "no"}`,
            `Project jsconfig: ${(0, paths_1.exists)((0, paths_1.joinPath)(projectRoot, "jsconfig.json")) ? "yes" : "no"}`,
            `Project Vue dependency: ${(0, paths_1.exists)((0, paths_1.joinPath)(projectRoot, "node_modules", "vue", "package.json")) ? "yes" : "no"}`,
            `Project TypeScript dependency: ${(0, paths_1.exists)((0, paths_1.joinPath)(projectRoot, "node_modules", "typescript", "package.json")) ? "yes" : "no"}`
        ],
        projectRoot
    };
}
function activeVuePath() {
    const active = nova.workspace.activeTextEditor?.document;
    if (active?.syntax === "vue" && typeof active.path === "string" && !(0, paths_1.isIgnoredWorkspacePath)(active.path)) {
        return active.path;
    }
    const document = nova.workspace.textDocuments.find((item) => item.syntax === "vue" && typeof item.path === "string" && !(0, paths_1.isIgnoredWorkspacePath)(item.path));
    return document?.path ?? null;
}
