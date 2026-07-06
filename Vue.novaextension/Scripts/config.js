"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readConfig = readConfig;
exports.watchConfigChanges = watchConfigChanges;
exports.resetGlobalConfiguration = resetGlobalConfiguration;
exports.resetWorkspaceConfiguration = resetWorkspaceConfiguration;
exports.resolveConfigurationSection = resolveConfigurationSection;

const constants_1 = require("./constants");
const logger_1 = require("./logger");

function readString(key) {
    const workspaceValue = nova.workspace.config.get(key, "string");
    if (workspaceValue) {
        return workspaceValue;
    }
    return nova.config.get(key, "string");
}

function readNumber(key, fallback) {
    const workspaceValue = nova.workspace.config.get(key, "number");
    const globalValue = nova.config.get(key, "number");
    const value = workspaceValue ?? globalValue ?? fallback;
    return Number.isFinite(value) ? value : fallback;
}

function readBoolean(key, fallback) {
    const workspaceValue = readWorkspaceBooleanOverride(key);
    const globalValue = nova.config.get(key, "boolean");
    return workspaceValue ?? globalValue ?? fallback;
}

function readGlobalBoolean(key, fallback) {
    return nova.config.get(key, "boolean") ?? fallback;
}

function readWorkspaceBooleanOverride(key) {
    const value = nova.workspace.config.get(key, "string");
    if (value === "enabled") {
        return true;
    }
    if (value === "disabled") {
        return false;
    }
    return null;
}

function readInitializationOptions() {
    const raw = readString(constants_1.CONFIG.initializationOptions);
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

function readConfig() {
    const typescriptEnabled = readBoolean(constants_1.CONFIG.typescriptEnabled, true);
    const typescriptNavigationEnabled = typescriptEnabled && readBoolean(constants_1.CONFIG.typescriptNavigationEnabled, true);
    return {
        serverEnabled: readBoolean(constants_1.CONFIG.serverEnabled, true),
        nodePath: readString(constants_1.CONFIG.nodePath),
        serverPath: readString(constants_1.CONFIG.serverPath),
        tsdk: readString(constants_1.CONFIG.tsdk),
        debug: readGlobalBoolean(constants_1.CONFIG.debug, false),
        lspLogs: readGlobalBoolean(constants_1.CONFIG.lspLogs, false),
        maxOldSpaceSize: readNumber(constants_1.CONFIG.maxOldSpaceSize, 2048),
        memoryAutoRetryEnabled: readBoolean(constants_1.CONFIG.memoryAutoRetryEnabled, true),
        restartOnConfigChange: readBoolean(constants_1.CONFIG.restartOnConfigChange, true),
        diagnosticsEnabled: readBoolean(constants_1.CONFIG.diagnosticsEnabled, true),
        vueDiagnosticsEnabled: readBoolean(constants_1.CONFIG.vueDiagnosticsEnabled, true),
        typescriptDiagnosticsEnabled: typescriptEnabled && readBoolean(constants_1.CONFIG.typescriptDiagnosticsEnabled, true),
        diagnosticsOnChangeEnabled: readBoolean(constants_1.CONFIG.diagnosticsOnChangeEnabled, true),
        diagnosticsOnSaveEnabled: readBoolean(constants_1.CONFIG.diagnosticsOnSaveEnabled, true),
        codeActionsEnabled: readBoolean(constants_1.CONFIG.codeActionsEnabled, true),
        typescriptEnabled,
        typescriptNavigationEnabled,
        typescriptHoverEnabled: typescriptNavigationEnabled && readBoolean(constants_1.CONFIG.typescriptHoverEnabled, true),
        typescriptDefinitionEnabled: typescriptNavigationEnabled && readBoolean(constants_1.CONFIG.typescriptDefinitionEnabled, true),
        typescriptReferencesEnabled: typescriptNavigationEnabled && readBoolean(constants_1.CONFIG.typescriptReferencesEnabled, true),
        typescriptRenameEnabled: typescriptEnabled && readBoolean(constants_1.CONFIG.typescriptRenameEnabled, true),
        typescriptCodeActionsEnabled: typescriptEnabled && readBoolean(constants_1.CONFIG.typescriptCodeActionsEnabled, true),
        completionEnabled: readBoolean(constants_1.CONFIG.completionEnabled, true),
        completionAutoImport: readBoolean(constants_1.CONFIG.completionAutoImport, true),
        proxyFallbackEnabled: readBoolean(constants_1.CONFIG.proxyFallbackEnabled, true),
        workspaceDiscoveryEnabled: readBoolean(constants_1.CONFIG.workspaceDiscoveryEnabled, true),
        workspaceWatchConfigFilesEnabled: readBoolean(constants_1.CONFIG.workspaceWatchConfigFilesEnabled, true),
        workspaceWatchPackageFilesEnabled: readBoolean(constants_1.CONFIG.workspaceWatchPackageFilesEnabled, true),
        initializationOptions: buildInitializationOptions(readInitializationOptions())
    };
}

function buildInitializationOptions(raw) {
    const tsEnabled = readBoolean(constants_1.CONFIG.typescriptEnabled, true);
    const tsNavigation = tsEnabled && readBoolean(constants_1.CONFIG.typescriptNavigationEnabled, true);
    const diagnostics = readBoolean(constants_1.CONFIG.diagnosticsEnabled, true);
    const vueDiagnostics = readBoolean(constants_1.CONFIG.vueDiagnosticsEnabled, true);
    const tsDiagnostics = tsEnabled && readBoolean(constants_1.CONFIG.typescriptDiagnosticsEnabled, true);
    const diagnosticsOnChange = readBoolean(constants_1.CONFIG.diagnosticsOnChangeEnabled, true);
    const diagnosticsOnSave = readBoolean(constants_1.CONFIG.diagnosticsOnSaveEnabled, true);
    const codeActions = readBoolean(constants_1.CONFIG.codeActionsEnabled, true);
    const tsHover = tsNavigation && readBoolean(constants_1.CONFIG.typescriptHoverEnabled, true);
    const tsDefinition = tsNavigation && readBoolean(constants_1.CONFIG.typescriptDefinitionEnabled, true);
    const tsReferences = tsNavigation && readBoolean(constants_1.CONFIG.typescriptReferencesEnabled, true);
    const tsRename = tsEnabled && readBoolean(constants_1.CONFIG.typescriptRenameEnabled, true);
    const tsCodeActions = tsEnabled && readBoolean(constants_1.CONFIG.typescriptCodeActionsEnabled, true);
    const completion = readBoolean(constants_1.CONFIG.completionEnabled, true);
    const autoImport = readBoolean(constants_1.CONFIG.completionAutoImport, true);
    const proxyFallback = readBoolean(constants_1.CONFIG.proxyFallbackEnabled, true);
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

function watchConfigChanges(callback) {
    const keys = allConfigurationKeys();
    const workspaceKeys = keys.filter((key) => key !== constants_1.CONFIG.debug && key !== constants_1.CONFIG.lspLogs);
    return [
        nova.config.onDidChange(constants_1.CONFIG.debug, callback),
        nova.config.onDidChange(constants_1.CONFIG.lspLogs, callback),
        ...workspaceKeys.flatMap((key) => [
            nova.config.onDidChange(key, callback),
            nova.workspace.config.onDidChange(key, callback)
        ])
    ];
}

function resetGlobalConfiguration() {
    for (const key of allConfigurationKeys()) {
        nova.config.remove(key);
    }
}

function resetWorkspaceConfiguration() {
    for (const key of allConfigurationKeys()) {
        nova.workspace.config.remove(key);
    }
}

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

function resolveConfigurationSection(section) {
    if (!section) {
        return null;
    }
    const config = readConfig();
    const values = {
        [constants_1.CONFIG.completionEnabled]: config.completionEnabled,
        [constants_1.CONFIG.completionAutoImport]: config.completionAutoImport,
        [constants_1.CONFIG.diagnosticsEnabled]: config.diagnosticsEnabled,
        [constants_1.CONFIG.vueDiagnosticsEnabled]: config.vueDiagnosticsEnabled,
        [constants_1.CONFIG.typescriptDiagnosticsEnabled]: config.typescriptDiagnosticsEnabled,
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
        const existingVue = config.initializationOptions.vue && typeof config.initializationOptions.vue === "object" && !Array.isArray(config.initializationOptions.vue)
            ? config.initializationOptions.vue
            : {};
        return {
            ...existingVue
        };
    }
    return null;
}
