import { CONFIG } from "@/shared/constants";
import { warn } from "@/shared/logger";
import { readBoolean, readRecord, readString } from "./values";

export function readInitializationOptions(): Record<string, unknown> {
  const record = readRecord(CONFIG.initializationOptions);
  if (record) {
    return record;
  }
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

export function buildInitializationOptions(raw: Record<string, unknown>): Record<string, unknown> {
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
