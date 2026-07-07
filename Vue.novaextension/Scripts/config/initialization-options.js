"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readInitializationOptions = readInitializationOptions;
exports.buildInitializationOptions = buildInitializationOptions;
const constants_1 = require("../shared/constants");
const logger_1 = require("../shared/logger");
const values_1 = require("./values");
function readInitializationOptions() {
    const record = (0, values_1.readRecord)(constants_1.CONFIG.initializationOptions);
    if (record) {
        return record;
    }
    const raw = (0, values_1.readString)(constants_1.CONFIG.initializationOptions);
    const text = raw?.trim();
    if (!text) {
        return {};
    }
    try {
        const parsed = JSON.parse(text);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    }
    catch (error) {
        (0, logger_1.warn)(`invalid initialization options JSON: ${String(error)}`);
        return {};
    }
}
function buildInitializationOptions(raw) {
    const tsEnabled = (0, values_1.readBoolean)(constants_1.CONFIG.typescriptEnabled, true);
    const tsNavigation = tsEnabled && (0, values_1.readBoolean)(constants_1.CONFIG.typescriptNavigationEnabled, true);
    const diagnostics = (0, values_1.readBoolean)(constants_1.CONFIG.diagnosticsEnabled, true);
    const vueDiagnostics = (0, values_1.readBoolean)(constants_1.CONFIG.vueDiagnosticsEnabled, true);
    const tsDiagnostics = tsEnabled && (0, values_1.readBoolean)(constants_1.CONFIG.typescriptDiagnosticsEnabled, true);
    const diagnosticsOnOpen = (0, values_1.readBoolean)(constants_1.CONFIG.diagnosticsOnOpenEnabled, true);
    const diagnosticsOnChange = (0, values_1.readBoolean)(constants_1.CONFIG.diagnosticsOnChangeEnabled, true);
    const diagnosticsOnSave = (0, values_1.readBoolean)(constants_1.CONFIG.diagnosticsOnSaveEnabled, true);
    const codeActions = (0, values_1.readBoolean)(constants_1.CONFIG.codeActionsEnabled, true);
    const tsHover = tsNavigation && (0, values_1.readBoolean)(constants_1.CONFIG.typescriptHoverEnabled, true);
    const tsDefinition = tsNavigation && (0, values_1.readBoolean)(constants_1.CONFIG.typescriptDefinitionEnabled, true);
    const tsReferences = tsNavigation && (0, values_1.readBoolean)(constants_1.CONFIG.typescriptReferencesEnabled, true);
    const tsRename = tsEnabled && (0, values_1.readBoolean)(constants_1.CONFIG.typescriptRenameEnabled, true);
    const tsCodeActions = tsEnabled && (0, values_1.readBoolean)(constants_1.CONFIG.typescriptCodeActionsEnabled, true);
    const completion = (0, values_1.readBoolean)(constants_1.CONFIG.completionEnabled, true);
    const autoImport = (0, values_1.readBoolean)(constants_1.CONFIG.completionAutoImport, true);
    const proxyFallback = (0, values_1.readBoolean)(constants_1.CONFIG.proxyFallbackEnabled, true);
    const existingVue = raw.vue && typeof raw.vue === "object" && !Array.isArray(raw.vue) ? raw.vue : {};
    return {
        ...raw,
        proxy: {
            ...(raw.proxy || {}),
            fallbackToVueLanguageServer: proxyFallback
        },
        vue: {
            ...existingVue,
            completion: {
                ...(existingVue.completion || {}),
                enabled: completion,
                autoImport
            },
            diagnostics: {
                ...(existingVue.diagnostics || {}),
                enabled: diagnostics,
                vue: vueDiagnostics,
                typescript: tsDiagnostics,
                onOpen: diagnosticsOnOpen,
                onChange: diagnosticsOnChange,
                onSave: diagnosticsOnSave
            },
            codeActions: {
                ...(existingVue.codeActions || {}),
                enabled: codeActions
            },
            typescript: {
                ...(existingVue.typescript || {}),
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
