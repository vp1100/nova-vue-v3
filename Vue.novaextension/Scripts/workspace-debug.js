"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logWorkspaceDebug = logWorkspaceDebug;
exports.logActiveEditorDebug = logActiveEditorDebug;
exports.logEditorDebug = logEditorDebug;
exports.registerWorkspaceDebugLogging = registerWorkspaceDebugLogging;

const config_1 = require("./config");
const logger_1 = require("./logger");
const workspace_paths_1 = require("./workspace-paths");

function workspacePath() {
    return nova.workspace.path ?? null;
}

function projectRootProbePath(workspaceRoot) {
    const activePath = nova.workspace.activeTextEditor?.document.path;
    if (activePath && (0, workspace_paths_1.containsPath)(workspaceRoot, activePath) && !(0, workspace_paths_1.isIgnoredWorkspacePath)(activePath)) {
        return activePath;
    }
    const vueDocument = nova.workspace.textDocuments.find((document) => document.syntax === "vue" &&
        typeof document.path === "string" &&
        (0, workspace_paths_1.containsPath)(workspaceRoot, document.path) &&
        !(0, workspace_paths_1.isIgnoredWorkspacePath)(document.path));
    return vueDocument?.path ?? null;
}

function documentLabel(document) {
    return document.path || document.uri || "untitled";
}

function logWorkspaceDebug(config, reason) {
    if (!config?.debug) {
        return;
    }
    const root = workspacePath();
    if (!root) {
        (0, logger_1.debug)(config, `workspace (${reason}): none`);
        return;
    }
    const signals = [
        `package.json=${(0, workspace_paths_1.exists)((0, workspace_paths_1.joinPath)(root, "package.json")) ? "yes" : "no"}`,
        `tsconfig=${(0, workspace_paths_1.exists)((0, workspace_paths_1.joinPath)(root, "tsconfig.json")) ? "yes" : "no"}`,
        `jsconfig=${(0, workspace_paths_1.exists)((0, workspace_paths_1.joinPath)(root, "jsconfig.json")) ? "yes" : "no"}`,
        `typescript=${(0, workspace_paths_1.exists)((0, workspace_paths_1.joinPath)(root, "node_modules", "typescript", "package.json")) ? "yes" : "no"}`,
        `vue=${(0, workspace_paths_1.exists)((0, workspace_paths_1.joinPath)(root, "node_modules", "vue", "package.json")) ? "yes" : "no"}`
    ];
    (0, logger_1.debug)(config, `workspace (${reason}): ${root}`);
    (0, logger_1.debug)(config, `project signals: ${signals.join(", ")}`);
    const probePath = projectRootProbePath(root);
    if (probePath) {
        const projectRoot = (0, workspace_paths_1.nearestProjectRoot)(probePath, root);
        if (projectRoot) {
            const projectSignals = [
                `package.json=${(0, workspace_paths_1.exists)((0, workspace_paths_1.joinPath)(projectRoot, "package.json")) ? "yes" : "no"}`,
                `tsconfig=${(0, workspace_paths_1.exists)((0, workspace_paths_1.joinPath)(projectRoot, "tsconfig.json")) ? "yes" : "no"}`,
                `jsconfig=${(0, workspace_paths_1.exists)((0, workspace_paths_1.joinPath)(projectRoot, "jsconfig.json")) ? "yes" : "no"}`,
                `typescript=${(0, workspace_paths_1.exists)((0, workspace_paths_1.joinPath)(projectRoot, "node_modules", "typescript", "package.json")) ? "yes" : "no"}`,
                `vue=${(0, workspace_paths_1.exists)((0, workspace_paths_1.joinPath)(projectRoot, "node_modules", "vue", "package.json")) ? "yes" : "no"}`
            ];
            (0, logger_1.debug)(config, `project root probe: ${probePath}`);
            (0, logger_1.debug)(config, `active project root: ${projectRoot}`);
            (0, logger_1.debug)(config, `active project signals: ${projectSignals.join(", ")}`);
        }
        else {
            (0, logger_1.debug)(config, "active project root: not found");
        }
    }
}

function logActiveEditorDebug(config, reason) {
    const editor = nova.workspace.activeTextEditor;
    if (!editor) {
        (0, logger_1.debug)(config, `active editor (${reason}): none`);
        return;
    }
    logEditorDebug(config, editor, `active editor (${reason})`);
}

function logEditorDebug(config, editor, reason) {
    if (!config?.debug) {
        return;
    }
    const document = editor.document;
    const path = documentLabel(document);
    const syntax = document.syntax || "none";
    const flags = [
        `syntax=${syntax}`,
        `inside-workspace=${(0, workspace_paths_1.workspaceContains)(document.path)}`,
        `dirty=${document.isDirty ? "yes" : "no"}`,
        `remote=${document.isRemote ? "yes" : "no"}`,
        `untitled=${document.isUntitled ? "yes" : "no"}`,
        `length=${document.length}`
    ];
    (0, logger_1.debug)(config, `${reason}: ${path} (${flags.join(", ")})`);
}

function registerWorkspaceDebugLogging(configProvider) {
    const getConfig = () => configProvider() ?? (0, config_1.readConfig)();
    const disposables = [];
    disposables.push(nova.workspace.onDidOpenTextDocument((document) => {
        const config = getConfig();
        if (!config.debug) {
            return;
        }
        (0, logger_1.debug)(config, `document opened: ${document.path || document.uri || "untitled"} (syntax=${document.syntax || "none"}, inside-workspace=${(0, workspace_paths_1.workspaceContains)(document.path)})`);
    }));
    disposables.push(nova.workspace.onDidAddTextEditor((editor) => {
        const config = getConfig();
        logEditorDebug(config, editor, `editor added: ${(0, workspace_paths_1.basename)(documentLabel(editor.document))}`);
        disposables.push(editor.document.onDidChangeSyntax((document, syntax) => {
            const latestConfig = getConfig();
            (0, logger_1.debug)(latestConfig, `document syntax changed: ${document.path || document.uri || "untitled"} -> ${syntax || "none"}`);
        }));
        disposables.push(editor.onDidSave((savedEditor) => {
            logEditorDebug(getConfig(), savedEditor, "editor saved");
        }));
    }));
    return [
        {
            dispose() {
                for (const disposable of disposables) {
                    disposable.dispose();
                }
            }
        }
    ];
}
