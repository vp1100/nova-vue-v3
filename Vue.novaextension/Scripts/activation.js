"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;

const config_1 = require("./config");
const commands_1 = require("./commands");
const language_client_1 = require("./language-client");
const logger_1 = require("./logger");
const paths_1 = require("./paths");
const workspace_debug_1 = require("./workspace-debug");

let disposables = [];
let service = null;

function watchWorkspaceFiles(callback) {
    const config = (0, config_1.readConfig)();
    const configPatterns = [
        "tsconfig*.json",
        "jsconfig*.json",
        "vite.config.*",
        "nuxt.config.*",
        "vue.config.*"
    ];
    const packagePatterns = [
        "package.json",
        "node_modules/typescript/package.json",
        "node_modules/@vue/language-server/package.json"
    ];
    const patterns = [
        ...(config.workspaceWatchConfigFilesEnabled ? configPatterns : []),
        ...(config.workspaceWatchPackageFilesEnabled ? packagePatterns : [])
    ];
    return patterns.map((pattern) => nova.fs.watch(pattern, callback));
}

function watchEditorDiagnostics(service) {
    const disposables = [];
    for (const editor of nova.workspace.textEditors) {
        disposables.push(...service.registerEditor(editor));
    }
    disposables.push(nova.workspace.onDidAddTextEditor((editor) => {
        disposables.push(...service.registerEditor(editor));
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

function activate() {
    (0, logger_1.info)("extension activated");
    service = new language_client_1.VueLanguageService();
    disposables = [
        ...(0, commands_1.registerCommands)(service),
        ...(0, config_1.watchConfigChanges)(() => service?.scheduleRestart("configuration changed")),
        ...watchWorkspaceFiles(() => {
            (0, paths_1.invalidateToolchainCache)();
            service?.scheduleRestart("workspace toolchain changed", 2500);
        }),
        ...watchEditorDiagnostics(service),
        ...(0, workspace_debug_1.registerWorkspaceDebugLogging)(() => service?.status.config ?? null)
    ];
}

function deactivate() {
    (0, logger_1.info)("extension deactivated");
    service?.stop();
    service = null;
    for (const disposable of disposables) {
        disposable.dispose();
    }
    disposables = [];
}
