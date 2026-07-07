import type { ExtensionConfig } from "./types";

import { CONFIG } from "@/shared/constants";
import { buildInitializationOptions, readInitializationOptions } from "./initialization-options";
import { readBoolean, readGlobalBoolean, readNumber, readString } from "./values";

export function readConfig(): ExtensionConfig {
  const typescriptEnabled = readBoolean(CONFIG.typescriptEnabled, true);
  const typescriptNavigationEnabled = typescriptEnabled && readBoolean(CONFIG.typescriptNavigationEnabled, true);
  return {
    serverEnabled: readBoolean(CONFIG.serverEnabled, true),
    nodePath: readString(CONFIG.nodePath),
    serverPath: readString(CONFIG.serverPath),
    tsdk: readString(CONFIG.tsdk),
    debug: readGlobalBoolean(CONFIG.debug, false),
    lspLogs: readGlobalBoolean(CONFIG.lspLogs, false),
    maxOldSpaceSize: readNumber(CONFIG.maxOldSpaceSize, 2048),
    memoryAutoRetryEnabled: readBoolean(CONFIG.memoryAutoRetryEnabled, true),
    restartOnConfigChange: readBoolean(CONFIG.restartOnConfigChange, true),
    diagnosticsEnabled: readBoolean(CONFIG.diagnosticsEnabled, true),
    vueDiagnosticsEnabled: readBoolean(CONFIG.vueDiagnosticsEnabled, true),
    typescriptDiagnosticsEnabled: typescriptEnabled && readBoolean(CONFIG.typescriptDiagnosticsEnabled, true),
    diagnosticsOnOpenEnabled: readBoolean(CONFIG.diagnosticsOnOpenEnabled, true),
    diagnosticsOnChangeEnabled: readBoolean(CONFIG.diagnosticsOnChangeEnabled, true),
    diagnosticsOnSaveEnabled: readBoolean(CONFIG.diagnosticsOnSaveEnabled, true),
    codeActionsEnabled: readBoolean(CONFIG.codeActionsEnabled, true),
    typescriptEnabled,
    typescriptNavigationEnabled,
    typescriptHoverEnabled: typescriptNavigationEnabled && readBoolean(CONFIG.typescriptHoverEnabled, true),
    typescriptDefinitionEnabled: typescriptNavigationEnabled && readBoolean(CONFIG.typescriptDefinitionEnabled, true),
    typescriptReferencesEnabled: typescriptNavigationEnabled && readBoolean(CONFIG.typescriptReferencesEnabled, true),
    typescriptRenameEnabled: typescriptEnabled && readBoolean(CONFIG.typescriptRenameEnabled, true),
    typescriptCodeActionsEnabled: typescriptEnabled && readBoolean(CONFIG.typescriptCodeActionsEnabled, true),
    completionEnabled: readBoolean(CONFIG.completionEnabled, true),
    completionAutoImport: readBoolean(CONFIG.completionAutoImport, true),
    proxyFallbackEnabled: readBoolean(CONFIG.proxyFallbackEnabled, true),
    workspaceDiscoveryEnabled: readBoolean(CONFIG.workspaceDiscoveryEnabled, true),
    workspaceWatchConfigFilesEnabled: readBoolean(CONFIG.workspaceWatchConfigFilesEnabled, true),
    workspaceWatchPackageFilesEnabled: readBoolean(CONFIG.workspaceWatchPackageFilesEnabled, true),
    initializationOptions: buildInitializationOptions(readInitializationOptions())
  };
}
