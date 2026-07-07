"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readConfig = readConfig;
const constants_1 = require("../shared/constants");
const initialization_options_1 = require("./initialization-options");
const values_1 = require("./values");
function readConfig() {
    const typescriptEnabled = (0, values_1.readBoolean)(constants_1.CONFIG.typescriptEnabled, true);
    const typescriptNavigationEnabled = typescriptEnabled && (0, values_1.readBoolean)(constants_1.CONFIG.typescriptNavigationEnabled, true);
    return {
        serverEnabled: (0, values_1.readBoolean)(constants_1.CONFIG.serverEnabled, true),
        nodePath: (0, values_1.readString)(constants_1.CONFIG.nodePath),
        serverPath: (0, values_1.readString)(constants_1.CONFIG.serverPath),
        tsdk: (0, values_1.readString)(constants_1.CONFIG.tsdk),
        debug: (0, values_1.readGlobalBoolean)(constants_1.CONFIG.debug, false),
        lspLogs: (0, values_1.readGlobalBoolean)(constants_1.CONFIG.lspLogs, false),
        maxOldSpaceSize: (0, values_1.readNumber)(constants_1.CONFIG.maxOldSpaceSize, 2048),
        memoryAutoRetryEnabled: (0, values_1.readBoolean)(constants_1.CONFIG.memoryAutoRetryEnabled, true),
        restartOnConfigChange: (0, values_1.readBoolean)(constants_1.CONFIG.restartOnConfigChange, true),
        diagnosticsEnabled: (0, values_1.readBoolean)(constants_1.CONFIG.diagnosticsEnabled, true),
        vueDiagnosticsEnabled: (0, values_1.readBoolean)(constants_1.CONFIG.vueDiagnosticsEnabled, true),
        typescriptDiagnosticsEnabled: typescriptEnabled && (0, values_1.readBoolean)(constants_1.CONFIG.typescriptDiagnosticsEnabled, true),
        diagnosticsOnOpenEnabled: (0, values_1.readBoolean)(constants_1.CONFIG.diagnosticsOnOpenEnabled, true),
        diagnosticsOnChangeEnabled: (0, values_1.readBoolean)(constants_1.CONFIG.diagnosticsOnChangeEnabled, true),
        diagnosticsOnSaveEnabled: (0, values_1.readBoolean)(constants_1.CONFIG.diagnosticsOnSaveEnabled, true),
        codeActionsEnabled: (0, values_1.readBoolean)(constants_1.CONFIG.codeActionsEnabled, true),
        typescriptEnabled,
        typescriptNavigationEnabled,
        typescriptHoverEnabled: typescriptNavigationEnabled && (0, values_1.readBoolean)(constants_1.CONFIG.typescriptHoverEnabled, true),
        typescriptDefinitionEnabled: typescriptNavigationEnabled && (0, values_1.readBoolean)(constants_1.CONFIG.typescriptDefinitionEnabled, true),
        typescriptReferencesEnabled: typescriptNavigationEnabled && (0, values_1.readBoolean)(constants_1.CONFIG.typescriptReferencesEnabled, true),
        typescriptRenameEnabled: typescriptEnabled && (0, values_1.readBoolean)(constants_1.CONFIG.typescriptRenameEnabled, true),
        typescriptCodeActionsEnabled: typescriptEnabled && (0, values_1.readBoolean)(constants_1.CONFIG.typescriptCodeActionsEnabled, true),
        completionEnabled: (0, values_1.readBoolean)(constants_1.CONFIG.completionEnabled, true),
        completionAutoImport: (0, values_1.readBoolean)(constants_1.CONFIG.completionAutoImport, true),
        proxyFallbackEnabled: (0, values_1.readBoolean)(constants_1.CONFIG.proxyFallbackEnabled, true),
        workspaceDiscoveryEnabled: (0, values_1.readBoolean)(constants_1.CONFIG.workspaceDiscoveryEnabled, true),
        workspaceWatchConfigFilesEnabled: (0, values_1.readBoolean)(constants_1.CONFIG.workspaceWatchConfigFilesEnabled, true),
        workspaceWatchPackageFilesEnabled: (0, values_1.readBoolean)(constants_1.CONFIG.workspaceWatchPackageFilesEnabled, true),
        initializationOptions: (0, initialization_options_1.buildInitializationOptions)((0, initialization_options_1.readInitializationOptions)())
    };
}
