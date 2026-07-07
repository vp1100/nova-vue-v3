import { CONFIG } from "@/shared/constants";

export const CUSTOM_DATA_CONFIG_KEYS = ["html.customData", "css.customData"];

export function allConfigurationKeys(): string[] {
  return [
    CONFIG.serverEnabled,
    CONFIG.nodePath,
    CONFIG.serverPath,
    CONFIG.tsdk,
    CONFIG.debug,
    CONFIG.lspLogs,
    CONFIG.maxOldSpaceSize,
    CONFIG.memoryAutoRetryEnabled,
    CONFIG.restartOnConfigChange,
    CONFIG.diagnosticsEnabled,
    CONFIG.vueDiagnosticsEnabled,
    CONFIG.typescriptDiagnosticsEnabled,
    CONFIG.diagnosticsOnOpenEnabled,
    CONFIG.diagnosticsOnChangeEnabled,
    CONFIG.diagnosticsOnSaveEnabled,
    CONFIG.codeActionsEnabled,
    CONFIG.typescriptEnabled,
    CONFIG.typescriptNavigationEnabled,
    CONFIG.typescriptHoverEnabled,
    CONFIG.typescriptDefinitionEnabled,
    CONFIG.typescriptReferencesEnabled,
    CONFIG.typescriptRenameEnabled,
    CONFIG.typescriptCodeActionsEnabled,
    CONFIG.completionEnabled,
    CONFIG.completionAutoImport,
    CONFIG.proxyFallbackEnabled,
    CONFIG.workspaceDiscoveryEnabled,
    CONFIG.workspaceWatchConfigFilesEnabled,
    CONFIG.workspaceWatchPackageFilesEnabled,
    CONFIG.initializationOptions
  ];
}
