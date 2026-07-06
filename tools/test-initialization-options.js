"use strict";

const assert = require("assert");
const path = require("path");

const root = path.resolve(__dirname, "..");
const configModulePath = path.join(root, "Vue.novaextension", "Scripts", "config.js");

const workspaceValues = new Map();
const globalValues = new Map();
const warnings = [];

global.nova = {
  workspace: {
    config: {
      get(key, coerce) {
        if (coerce === "string" && typeof workspaceValues.get(key) !== "string") {
          return null;
        }
        if (coerce === "boolean" && typeof workspaceValues.get(key) !== "boolean") {
          return null;
        }
        return workspaceValues.get(key);
      },
      remove(key) {
        workspaceValues.delete(key);
      }
    }
  },
  config: {
    get(key, coerce) {
      if (coerce === "string" && typeof globalValues.get(key) !== "string") {
        return null;
      }
      if (coerce === "boolean" && typeof globalValues.get(key) !== "boolean") {
        return null;
      }
      return globalValues.get(key);
    },
    remove(key) {
      globalValues.delete(key);
    }
  }
};

const originalWarn = console.warn;
console.warn = (message) => {
  warnings.push(String(message));
};

try {
  delete require.cache[require.resolve(configModulePath)];
  const { readConfig, resetGlobalConfiguration, resetWorkspaceConfiguration } = require(configModulePath);

  assertEmptyOptions(readConfig, "", "empty global value");
  assertEmptyOptions(readConfig, "   \n\t  ", "whitespace global value");
  assertGlobalOnlyLogOptions(readConfig);
  assertWorkspaceTriStateBooleans(readConfig);
  assertResetConfiguration(resetGlobalConfiguration, resetWorkspaceConfiguration);

  warnings.length = 0;
  globalValues.set("vue.initializationOptions", JSON.stringify({
    customRoot: true,
    proxy: { customProxyFlag: "kept" },
    vue: { customVueFlag: "kept" }
  }));

  const config = readConfig();
  assert.strictEqual(config.initializationOptions.customRoot, true);
  assert.strictEqual(config.initializationOptions.proxy.customProxyFlag, "kept");
  assert.strictEqual(config.initializationOptions.proxy.fallbackToVueLanguageServer, true);
  assert.strictEqual(config.initializationOptions.vue.customVueFlag, "kept");
  assert.strictEqual(config.initializationOptions.vue.completion.enabled, true);
  assert.strictEqual(config.initializationOptions.vue.diagnostics.onOpen, true);
  assert.deepStrictEqual(warnings, []);

  console.log("Initialization options config test passed.");
} finally {
  console.warn = originalWarn;
}

function assertEmptyOptions(readConfig, value, label) {
  warnings.length = 0;
  workspaceValues.clear();
  globalValues.clear();
  globalValues.set("vue.initializationOptions", value);

  const config = readConfig();
  assert.strictEqual(config.initializationOptions.proxy.fallbackToVueLanguageServer, true, label);
  assert.strictEqual(config.initializationOptions.vue.completion.enabled, true, label);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(config.initializationOptions, "customRoot"), false, label);
  assert.deepStrictEqual(warnings, [], label);
}

function assertGlobalOnlyLogOptions(readConfig) {
  workspaceValues.clear();
  globalValues.clear();
  workspaceValues.set("vue.debug", true);
  workspaceValues.set("vue.lsp.logs", true);
  globalValues.set("vue.debug", false);
  globalValues.set("vue.lsp.logs", false);

  let config = readConfig();
  assert.strictEqual(config.debug, false, "workspace debug override should be ignored");
  assert.strictEqual(config.lspLogs, false, "workspace LSP logs override should be ignored");

  globalValues.set("vue.debug", true);
  globalValues.set("vue.lsp.logs", true);
  config = readConfig();
  assert.strictEqual(config.debug, true, "global debug logs should be honored");
  assert.strictEqual(config.lspLogs, true, "global LSP logs should be honored");
}

function assertWorkspaceTriStateBooleans(readConfig) {
  workspaceValues.clear();
  globalValues.clear();
  globalValues.set("vue.completion.enabled", false);
  assert.strictEqual(readConfig().completionEnabled, false, "project Global should inherit global false");

  workspaceValues.set("vue.completion.enabled", "enabled");
  assert.strictEqual(readConfig().completionEnabled, true, "project Enabled should override global false");

  workspaceValues.set("vue.completion.enabled", "disabled");
  assert.strictEqual(readConfig().completionEnabled, false, "project Disabled should override global false");

  workspaceValues.set("vue.completion.enabled", "global");
  assert.strictEqual(readConfig().completionEnabled, false, "project Global string should inherit global false");

  workspaceValues.set("vue.completion.enabled", true);
  assert.strictEqual(readConfig().completionEnabled, false, "legacy project boolean should not override global settings");
}

function assertResetConfiguration(resetGlobalConfiguration, resetWorkspaceConfiguration) {
  workspaceValues.clear();
  globalValues.clear();
  workspaceValues.set("vue.completion.enabled", "disabled");
  globalValues.set("vue.completion.enabled", true);

  resetGlobalConfiguration();
  assert.strictEqual(globalValues.has("vue.completion.enabled"), false, "global reset should remove global value");
  assert.strictEqual(workspaceValues.get("vue.completion.enabled"), "disabled", "global reset should not remove project value");

  resetWorkspaceConfiguration();
  assert.strictEqual(workspaceValues.has("vue.completion.enabled"), false, "project reset should remove project value");
}
