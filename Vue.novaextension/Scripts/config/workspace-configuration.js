"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveConfigurationSection = resolveConfigurationSection;
const constants_1 = require("../shared/constants");
const custom_data_1 = require("./custom-data");
const keys_1 = require("./keys");
const reader_1 = require("./reader");
function resolveConfigurationSection(section) {
    if (!section) {
        return null;
    }
    const config = (0, reader_1.readConfig)();
    const values = {
        [constants_1.CONFIG.completionEnabled]: config.completionEnabled,
        [constants_1.CONFIG.completionAutoImport]: config.completionAutoImport,
        [constants_1.CONFIG.diagnosticsEnabled]: config.diagnosticsEnabled,
        [constants_1.CONFIG.vueDiagnosticsEnabled]: config.vueDiagnosticsEnabled,
        [constants_1.CONFIG.typescriptDiagnosticsEnabled]: config.typescriptDiagnosticsEnabled,
        [constants_1.CONFIG.diagnosticsOnOpenEnabled]: config.diagnosticsOnOpenEnabled,
        [constants_1.CONFIG.diagnosticsOnChangeEnabled]: config.diagnosticsOnChangeEnabled,
        [constants_1.CONFIG.diagnosticsOnSaveEnabled]: config.diagnosticsOnSaveEnabled,
        [constants_1.CONFIG.codeActionsEnabled]: config.codeActionsEnabled,
        [constants_1.CONFIG.typescriptEnabled]: config.typescriptEnabled,
        [constants_1.CONFIG.typescriptNavigationEnabled]: config.typescriptNavigationEnabled,
        [constants_1.CONFIG.typescriptHoverEnabled]: config.typescriptHoverEnabled,
        [constants_1.CONFIG.typescriptDefinitionEnabled]: config.typescriptDefinitionEnabled,
        [constants_1.CONFIG.typescriptReferencesEnabled]: config.typescriptReferencesEnabled,
        [constants_1.CONFIG.typescriptRenameEnabled]: config.typescriptRenameEnabled,
        [constants_1.CONFIG.typescriptCodeActionsEnabled]: config.typescriptCodeActionsEnabled,
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
    if (keys_1.CUSTOM_DATA_CONFIG_KEYS.includes(section)) {
        return (0, custom_data_1.customDataConfigurationValue)(section);
    }
    if (Object.prototype.hasOwnProperty.call(config.initializationOptions, section)) {
        return config.initializationOptions[section];
    }
    if (section === "vue") {
        const existingVue = config.initializationOptions.vue && typeof config.initializationOptions.vue === "object" && !Array.isArray(config.initializationOptions.vue)
            ? config.initializationOptions.vue
            : {};
        return {
            ...existingVue
        };
    }
    return null;
}
