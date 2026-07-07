import { CONFIG } from "@/shared/constants";
import { customDataConfigurationValue } from "./custom-data";
import { CUSTOM_DATA_CONFIG_KEYS } from "./keys";
import { readConfig } from "./reader";

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
  if (CUSTOM_DATA_CONFIG_KEYS.includes(section)) {
    return customDataConfigurationValue(section);
  }
  if (Object.prototype.hasOwnProperty.call(config.initializationOptions, section)) {
    return config.initializationOptions[section];
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
