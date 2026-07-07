"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const index_1 = require("../commands/index");
const index_2 = require("../config/index");
const color_assistant_1 = require("../features/color-assistant");
const index_3 = require("../language/actions/index");
const VueLanguageService_1 = require("../language/VueLanguageService");
const logger_1 = require("../shared/logger");
const index_4 = require("../toolchain/index");
const debug_1 = require("../workspace/debug");
let disposables = [];
let service = null;
function watchWorkspaceFiles(callback) {
    const config = (0, index_2.readConfig)();
    const configPatterns = [
        ".nova/Configuration.json",
        "tsconfig*.json",
        "jsconfig*.json",
        "vite.config.*",
        "nuxt.config.*",
        "vue.config.*",
    ];
    const packagePatterns = [
        "package.json",
        "node_modules/typescript/package.json",
        "node_modules/@vue/language-server/package.json",
    ];
    const patterns = [
        ...(config.workspaceWatchConfigFilesEnabled ? configPatterns : []),
        ...(config.workspaceWatchPackageFilesEnabled ? packagePatterns : []),
        ...(0, index_2.readCustomDataWatchPatterns)(),
    ];
    return [...new Set(patterns)].map((pattern) => nova.fs.watch(pattern, callback));
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
            },
        },
    ];
}
function activate() {
    (0, logger_1.info)("extension activated");
    service = new VueLanguageService_1.VueLanguageService();
    const languageActions = (0, index_3.createLanguageActions)(service.featureContext());
    let workspaceFileWatchers = [];
    const disposeWorkspaceFileWatchers = () => {
        for (const disposable of workspaceFileWatchers) {
            disposable.dispose();
        }
        workspaceFileWatchers = [];
    };
    const refreshWorkspaceFileWatchers = () => {
        disposeWorkspaceFileWatchers();
        workspaceFileWatchers = watchWorkspaceFiles(() => {
            (0, index_4.invalidateToolchainCache)();
            service?.scheduleRestart("workspace file changed", 2500);
        });
    };
    refreshWorkspaceFileWatchers();
    disposables = [
        ...(0, color_assistant_1.registerColorAssistant)(),
        ...(0, index_1.registerCommands)(service, languageActions),
        ...(0, index_2.watchConfigChanges)(() => {
            refreshWorkspaceFileWatchers();
            service?.scheduleRestart("configuration changed");
        }),
        { dispose: disposeWorkspaceFileWatchers },
        ...watchEditorDiagnostics(service),
        ...(0, debug_1.registerWorkspaceDebugLogging)(() => service?.status.config ?? null),
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
