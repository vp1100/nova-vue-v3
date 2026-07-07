"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.watchConfigChanges = watchConfigChanges;
exports.resetGlobalConfiguration = resetGlobalConfiguration;
exports.resetWorkspaceConfiguration = resetWorkspaceConfiguration;
const constants_1 = require("../shared/constants");
const keys_1 = require("./keys");
function watchConfigChanges(callback) {
    const keys = (0, keys_1.allConfigurationKeys)();
    const workspaceKeys = keys.filter((key) => key !== constants_1.CONFIG.debug && key !== constants_1.CONFIG.lspLogs);
    return [
        nova.config.onDidChange(constants_1.CONFIG.debug, callback),
        nova.config.onDidChange(constants_1.CONFIG.lspLogs, callback),
        ...workspaceKeys.flatMap((key) => [
            nova.config.onDidChange(key, callback),
            nova.workspace.config.onDidChange(key, callback)
        ]),
        ...keys_1.CUSTOM_DATA_CONFIG_KEYS.flatMap((key) => [
            nova.config.onDidChange(key, callback),
            nova.workspace.config.onDidChange(key, callback)
        ])
    ];
}
function resetGlobalConfiguration() {
    for (const key of (0, keys_1.allConfigurationKeys)()) {
        nova.config.remove(key);
    }
}
function resetWorkspaceConfiguration() {
    for (const key of (0, keys_1.allConfigurationKeys)()) {
        nova.workspace.config.remove(key);
    }
}
