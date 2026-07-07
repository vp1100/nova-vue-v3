"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CUSTOM_DATA_CONFIG_KEYS = void 0;
exports.allConfigurationKeys = allConfigurationKeys;
const constants_1 = require("../shared/constants");
exports.CUSTOM_DATA_CONFIG_KEYS = ["html.customData", "css.customData"];
function allConfigurationKeys() {
    return [
        constants_1.CONFIG.serverEnabled,
        constants_1.CONFIG.nodePath,
        constants_1.CONFIG.serverPath,
        constants_1.CONFIG.tsdk,
        constants_1.CONFIG.debug,
        constants_1.CONFIG.lspLogs,
        constants_1.CONFIG.maxOldSpaceSize,
        constants_1.CONFIG.memoryAutoRetryEnabled,
        constants_1.CONFIG.restartOnConfigChange,
        constants_1.CONFIG.diagnosticsEnabled,
        constants_1.CONFIG.vueDiagnosticsEnabled,
        constants_1.CONFIG.typescriptDiagnosticsEnabled,
        constants_1.CONFIG.diagnosticsOnOpenEnabled,
        constants_1.CONFIG.diagnosticsOnChangeEnabled,
        constants_1.CONFIG.diagnosticsOnSaveEnabled,
        constants_1.CONFIG.codeActionsEnabled,
        constants_1.CONFIG.typescriptEnabled,
        constants_1.CONFIG.typescriptNavigationEnabled,
        constants_1.CONFIG.typescriptHoverEnabled,
        constants_1.CONFIG.typescriptDefinitionEnabled,
        constants_1.CONFIG.typescriptReferencesEnabled,
        constants_1.CONFIG.typescriptRenameEnabled,
        constants_1.CONFIG.typescriptCodeActionsEnabled,
        constants_1.CONFIG.completionEnabled,
        constants_1.CONFIG.completionAutoImport,
        constants_1.CONFIG.proxyFallbackEnabled,
        constants_1.CONFIG.workspaceDiscoveryEnabled,
        constants_1.CONFIG.workspaceWatchConfigFilesEnabled,
        constants_1.CONFIG.workspaceWatchPackageFilesEnabled,
        constants_1.CONFIG.initializationOptions
    ];
}
