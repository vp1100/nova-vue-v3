import { CONFIG } from "./constants";
import { warn } from "./logger";

export interface ExtensionConfig {
  serverEnabled: boolean;
  nodePath: string | null;
  serverPath: string | null;
  tsdk: string | null;
  debug: boolean;
  lspLogs: boolean;
  maxOldSpaceSize: number;
  memoryAutoRetryEnabled: boolean;
  restartOnConfigChange: boolean;
  diagnosticsEnabled: boolean;
  vueDiagnosticsEnabled: boolean;
  typescriptDiagnosticsEnabled: boolean;
  diagnosticsOnOpenEnabled: boolean;
  diagnosticsOnChangeEnabled: boolean;
  diagnosticsOnSaveEnabled: boolean;
  codeActionsEnabled: boolean;
  typescriptEnabled: boolean;
  typescriptNavigationEnabled: boolean;
  typescriptHoverEnabled: boolean;
  typescriptDefinitionEnabled: boolean;
  typescriptReferencesEnabled: boolean;
  typescriptRenameEnabled: boolean;
  typescriptCodeActionsEnabled: boolean;
  completionEnabled: boolean;
  completionAutoImport: boolean;
  proxyFallbackEnabled: boolean;
  workspaceDiscoveryEnabled: boolean;
  workspaceWatchConfigFilesEnabled: boolean;
  workspaceWatchPackageFilesEnabled: boolean;
  initializationOptions: Record<string, unknown>;
}

function readString(key: string): string | null {
  const workspaceValue = nova.workspace.config.get(key, "string");
  if (workspaceValue) {
    return workspaceValue;
  }
  return nova.config.get(key, "string");
}

function readNumber(key: string, fallback: number): number {
  const workspaceValue = nova.workspace.config.get(key, "number");
  const globalValue = nova.config.get(key, "number");
  const value = workspaceValue ?? globalValue ?? fallback;
  return Number.isFinite(value) ? value : fallback;
}

function readBoolean(key: string, fallback: boolean): boolean {
  const workspaceValue = readWorkspaceBooleanOverride(key);
  const globalValue = nova.config.get(key, "boolean");
  return workspaceValue ?? globalValue ?? fallback;
}

function readGlobalBoolean(key: string, fallback: boolean): boolean {
  return nova.config.get(key, "boolean") ?? fallback;
}

function readWorkspaceBooleanOverride(key: string): boolean | null {
  const value = nova.workspace.config.get(key, "string");
  if (value === "enabled") {
    return true;
  }
  if (value === "disabled") {
    return false;
  }
  return null;
}

function readInitializationOptions(): Record<string, unknown> {
  const raw = readString(CONFIG.initializationOptions);
  const text = raw?.trim();
  if (!text) {
    return {};
  }
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    warn(`invalid initialization options JSON: ${String(error)}`);
    return {};
  }
}

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

function buildInitializationOptions(raw: Record<string, unknown>): Record<string, unknown> {
  const tsEnabled = readBoolean(CONFIG.typescriptEnabled, true);
  const tsNavigation = tsEnabled && readBoolean(CONFIG.typescriptNavigationEnabled, true);
  const diagnostics = readBoolean(CONFIG.diagnosticsEnabled, true);
  const vueDiagnostics = readBoolean(CONFIG.vueDiagnosticsEnabled, true);
  const tsDiagnostics = tsEnabled && readBoolean(CONFIG.typescriptDiagnosticsEnabled, true);
  const diagnosticsOnOpen = readBoolean(CONFIG.diagnosticsOnOpenEnabled, true);
  const diagnosticsOnChange = readBoolean(CONFIG.diagnosticsOnChangeEnabled, true);
  const diagnosticsOnSave = readBoolean(CONFIG.diagnosticsOnSaveEnabled, true);
  const codeActions = readBoolean(CONFIG.codeActionsEnabled, true);
  const tsHover = tsNavigation && readBoolean(CONFIG.typescriptHoverEnabled, true);
  const tsDefinition = tsNavigation && readBoolean(CONFIG.typescriptDefinitionEnabled, true);
  const tsReferences = tsNavigation && readBoolean(CONFIG.typescriptReferencesEnabled, true);
  const tsRename = tsEnabled && readBoolean(CONFIG.typescriptRenameEnabled, true);
  const tsCodeActions = tsEnabled && readBoolean(CONFIG.typescriptCodeActionsEnabled, true);
  const completion = readBoolean(CONFIG.completionEnabled, true);
  const autoImport = readBoolean(CONFIG.completionAutoImport, true);
  const proxyFallback = readBoolean(CONFIG.proxyFallbackEnabled, true);
  const existingVue = raw.vue && typeof raw.vue === "object" && !Array.isArray(raw.vue) ? raw.vue : {};
  return {
    ...raw,
    proxy: {
      ...((raw.proxy as Record<string, unknown>) || {}),
      fallbackToVueLanguageServer: proxyFallback
    },
    vue: {
      ...(existingVue as Record<string, unknown>),
      completion: {
        ...(((existingVue as Record<string, unknown>).completion as Record<string, unknown>) || {}),
        enabled: completion,
        autoImport
      },
      diagnostics: {
        ...(((existingVue as Record<string, unknown>).diagnostics as Record<string, unknown>) || {}),
        enabled: diagnostics,
        vue: vueDiagnostics,
        typescript: tsDiagnostics,
        onOpen: diagnosticsOnOpen,
        onChange: diagnosticsOnChange,
        onSave: diagnosticsOnSave
      },
      codeActions: {
        ...(((existingVue as Record<string, unknown>).codeActions as Record<string, unknown>) || {}),
        enabled: codeActions
      },
      typescript: {
        ...(((existingVue as Record<string, unknown>).typescript as Record<string, unknown>) || {}),
        enabled: tsEnabled,
        navigation: tsNavigation,
        hover: tsHover,
        definition: tsDefinition,
        references: tsReferences,
        rename: tsRename,
        codeActions: tsCodeActions
      }
    }
  };
}

export function watchConfigChanges(callback: () => void): Disposable[] {
  const keys = allConfigurationKeys();
  const workspaceKeys = keys.filter((key) => key !== CONFIG.debug && key !== CONFIG.lspLogs);
  return [
    nova.config.onDidChange(CONFIG.debug, callback),
    nova.config.onDidChange(CONFIG.lspLogs, callback),
    ...workspaceKeys.flatMap((key) => [
      nova.config.onDidChange(key, callback),
      nova.workspace.config.onDidChange(key, callback)
    ])
  ];
}

export function resetGlobalConfiguration(): void {
  for (const key of allConfigurationKeys()) {
    nova.config.remove(key);
  }
}

export function resetWorkspaceConfiguration(): void {
  for (const key of allConfigurationKeys()) {
    nova.workspace.config.remove(key);
  }
}

function allConfigurationKeys(): string[] {
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

export function resolveConfigurationSection(section: string | undefined): unknown {
  if (!section) {
    return null;
  }
  const config = readConfig();
  const values: Record<string, unknown> = {
    [CONFIG.completionEnabled]: config.completionEnabled,
    [CONFIG.completionAutoImport]: config.completionAutoImport,
    [CONFIG.diagnosticsEnabled]: config.diagnosticsEnabled,
    [CONFIG.vueDiagnosticsEnabled]: config.vueDiagnosticsEnabled,
    [CONFIG.typescriptDiagnosticsEnabled]: config.typescriptDiagnosticsEnabled,
    [CONFIG.diagnosticsOnOpenEnabled]: config.diagnosticsOnOpenEnabled,
    [CONFIG.diagnosticsOnChangeEnabled]: config.diagnosticsOnChangeEnabled,
    [CONFIG.diagnosticsOnSaveEnabled]: config.diagnosticsOnSaveEnabled,
    [CONFIG.codeActionsEnabled]: config.codeActionsEnabled,
    [CONFIG.typescriptEnabled]: config.typescriptEnabled,
    [CONFIG.typescriptNavigationEnabled]: config.typescriptNavigationEnabled,
    [CONFIG.typescriptHoverEnabled]: config.typescriptHoverEnabled,
    [CONFIG.typescriptDefinitionEnabled]: config.typescriptDefinitionEnabled,
    [CONFIG.typescriptReferencesEnabled]: config.typescriptReferencesEnabled,
    [CONFIG.typescriptRenameEnabled]: config.typescriptRenameEnabled,
    [CONFIG.typescriptCodeActionsEnabled]: config.typescriptCodeActionsEnabled,
    "vue.completion.enabled": config.completionEnabled,
    "vue.completion.autoImport": config.completionAutoImport,
    "vue.diagnostics.enabled": config.diagnosticsEnabled,
    "vue.diagnostics.vue": config.vueDiagnosticsEnabled,
    "vue.diagnostics.typescript": config.typescriptDiagnosticsEnabled,
    "vue.diagnostics.onOpen": config.diagnosticsOnOpenEnabled,
    "vue.diagnostics.onChange": config.diagnosticsOnChangeEnabled,
    "vue.diagnostics.onSave": config.diagnosticsOnSaveEnabled,
    "vue.codeActions.enabled": config.codeActionsEnabled,
    "vue.typescript.enabled": config.typescriptEnabled,
    "vue.typescript.navigation": config.typescriptNavigationEnabled,
    "vue.typescript.hover": config.typescriptHoverEnabled,
    "vue.typescript.definition": config.typescriptDefinitionEnabled,
    "vue.typescript.references": config.typescriptReferencesEnabled,
    "vue.typescript.rename": config.typescriptRenameEnabled,
    "vue.typescript.codeActions": config.typescriptCodeActionsEnabled
  };
  if (Object.prototype.hasOwnProperty.call(values, section)) {
    return values[section];
  }
  if (section === "vue") {
    const existingVue =
      config.initializationOptions.vue && typeof config.initializationOptions.vue === "object" && !Array.isArray(config.initializationOptions.vue)
        ? (config.initializationOptions.vue as Record<string, unknown>)
        : {};
    return {
      ...existingVue
    };
  }
  return null;
}
