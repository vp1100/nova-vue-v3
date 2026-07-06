"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const bundleRoot = path.join(root, "Vue.novaextension");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(bundleRoot, relativePath), "utf8"));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function exists(relativePath) {
  return fs.existsSync(path.join(bundleRoot, relativePath));
}

const manifest = readJson("extension.json");

const requiredFiles = [
  "extension.json",
  "Scripts/main.js",
  "Images/extension",
  "extension.png",
  "Images/extension/vue-logo.png",
  "Queries/highlights.scm",
  "Queries/injections.scm",
  "Queries/folds.scm",
  "Queries/symbols.scm",
  "Queries/tagDisplayName.scm",
  "Queries/tagMatching.scm",
  "Queries/textChecking.scm",
  "Syntaxes/Pug.xml",
  "Syntaxes/Stylus.xml",
  "Syntaxes/Vue.xml",
  "Syntaxes/libtree-sitter-pug.dylib",
  "Syntaxes/libtree-sitter-stylus.dylib",
  "Syntaxes/libtree-sitter-vue.dylib",
  "Queries/pug/highlights.scm",
  "Queries/stylus/highlights.scm",
  "Support/proxy/vue-lsp-proxy.js",
  "Support/server/package.json",
  "Support/server/package-lock.json",
  "README.md"
];

for (const file of requiredFiles) {
  assert(exists(file), `Missing required file: ${file}`);
}

assert(manifest.main === "main.js", "Manifest main must point to main.js, resolved by Nova inside Scripts/");
assert(manifest.min_runtime === "10.0", "Nova 10+ is required for syntax languageId mapping");
assert(typeof manifest.bugs === "string" && manifest.bugs.length > 0, "Manifest must include required bugs URL");
assert(typeof manifest.organization === "string" && manifest.organization.length > 0, "Manifest must include organization");
assert(manifest.entitlements.process === true, "Process entitlement is required");
assert(manifest.entitlements.filesystem === "readonly", "Filesystem entitlement must stay readonly");
assert(manifest.entitlements.requests === false, "Runtime network requests must stay disabled");

const commands = new Set();
for (const section of Object.values(manifest.commands || {})) {
  for (const command of section) {
    commands.add(command.command);
  }
}

for (const command of [
  "vue.restartLanguageServer",
  "vue.showServerStatus",
  "vue.copyDebugInfo",
  "vue.copyLspCapabilities",
  "vue.probeLspAtCursor",
  "vue.renameSymbol",
  "vue.quickFix",
  "vue.addMissingImports",
  "vue.removeUnusedImports",
  "vue.organizeImports",
  "vue.redetectToolchain",
  "vue.openSettings",
  "vue.resetGlobalSettings",
  "vue.resetWorkspaceSettings"
]) {
  assert(commands.has(command), `Missing command: ${command}`);
}

function collectConfigKeys(items, keys = new Set()) {
  for (const item of items || []) {
    if (item.key) {
      keys.add(item.key);
    }
    if (Array.isArray(item.children)) {
      collectConfigKeys(item.children, keys);
    }
  }
  return keys;
}

function findConfigItem(items, key) {
  for (const item of items || []) {
    if (item.key === key) {
      return item;
    }
    const child = findConfigItem(item.children, key);
    if (child) {
      return child;
    }
  }
  return null;
}

const configKeys = collectConfigKeys([...(manifest.config || []), ...(manifest.configWorkspace || [])]);
const configSections = [...(manifest.config || []), ...(manifest.configWorkspace || [])].filter((item) => item.type === "section");
for (const section of ["Workspace", "Runtime & Paths", "Vue Language Server", "TypeScript", "Diagnostic Triggers", "Advanced"]) {
  assert(configSections.some((item) => item.title === section), `Missing collapsible settings section: ${section}`);
}
assert(manifest.config?.[0]?.title === "Workspace", "Workspace settings section should be first in global settings");
assert(manifest.configWorkspace?.[0]?.title === "Workspace", "Workspace settings section should be first in workspace settings");

for (const key of [
  "vue.server.enabled",
  "vue.languageServer.path",
  "vue.typescript.tsdk",
  "vue.lsp.logs",
  "vue.memory.autoRetry.enabled",
  "vue.server.restartOnConfigChange",
  "vue.diagnostics.enabled",
  "vue.diagnostics.vue.enabled",
  "vue.diagnostics.typescript.enabled",
  "vue.diagnostics.onOpen.enabled",
  "vue.typescript.enabled",
  "vue.typescript.navigation.enabled",
  "vue.completion.enabled",
  "vue.completion.autoImport"
]) {
  assert(configKeys.has(key), `Missing config key: ${key}`);
}

for (const key of [
  "vue.typescript.hover.enabled",
  "vue.typescript.definition.enabled",
  "vue.typescript.references.enabled"
]) {
  assert(!configKeys.has(key), `Granular TypeScript navigation key should stay hidden from the main settings UI: ${key}`);
}
assert(!configKeys.has("vue.workspace.ignorePaths"), "Workspace ignore paths were removed and should not be exposed in settings UI");
assert(!findConfigItem(manifest.configWorkspace, "vue.debug"), "Debug logs should stay global-only, not per-project");
assert(!findConfigItem(manifest.configWorkspace, "vue.lsp.logs"), "LSP logs should stay global-only, not per-project");
assert(findConfigItem(manifest.config, "vue.initializationOptions")?.default === "", "Global initialization options should be empty by default");
assert(findConfigItem(manifest.configWorkspace, "vue.initializationOptions")?.default === "", "Workspace initialization options should be empty by default");
assert(
  manifest.config?.[0]?.children?.some((item) => item.command === "vue.resetGlobalSettings"),
  "Global settings should include a reset command"
);
assert(
  manifest.configWorkspace?.[0]?.children?.some((item) => item.command === "vue.resetWorkspaceSettings"),
  "Workspace settings should include a project reset command"
);

const workspaceBooleanKeys = [
  "vue.server.enabled",
  "vue.memory.autoRetry.enabled",
  "vue.server.restartOnConfigChange",
  "vue.diagnostics.enabled",
  "vue.diagnostics.vue.enabled",
  "vue.diagnostics.typescript.enabled",
  "vue.diagnostics.onOpen.enabled",
  "vue.diagnostics.onChange.enabled",
  "vue.diagnostics.onSave.enabled",
  "vue.codeActions.enabled",
  "vue.typescript.enabled",
  "vue.typescript.navigation.enabled",
  "vue.typescript.rename.enabled",
  "vue.typescript.codeActions.enabled",
  "vue.completion.enabled",
  "vue.completion.autoImport",
  "vue.proxy.fallbackToVueLanguageServer.enabled",
  "vue.workspace.discovery.enabled",
  "vue.workspace.watchConfigFiles.enabled",
  "vue.workspace.watchPackageFiles.enabled"
];
for (const key of workspaceBooleanKeys) {
  const item = findConfigItem(manifest.configWorkspace, key);
  assert(item?.type === "enum", `Workspace boolean setting should be a tri-state enum: ${key}`);
  assert(item.default === "global", `Workspace tri-state setting should inherit globally by default: ${key}`);
  assert(item.radio === true, `Workspace tri-state setting should use radio buttons: ${key}`);
  assert(
    JSON.stringify(item.values) === JSON.stringify([["global", "Global"], ["enabled", "Enabled"], ["disabled", "Disabled"]]),
    `Workspace tri-state setting has unexpected values: ${key}`
  );
}

const runtime = fs
  .readdirSync(path.join(bundleRoot, "Scripts"))
  .filter((file) => file.endsWith(".js"))
  .map((file) => fs.readFileSync(path.join(bundleRoot, "Scripts", file), "utf8"))
  .join("\n");
assert(!runtime.includes("javascriptreact"), "Vue extension must not register React language IDs");
assert(!runtime.includes("typescriptreact"), "Vue extension must not register React language IDs");
assert(!runtime.includes('syntax: "javascript"'), "Vue extension must not register JavaScript syntax");
assert(!runtime.includes('syntax: "typescript"'), "Vue extension must not register TypeScript syntax");
assert(runtime.includes("Global vue-language-server and global TypeScript are intentionally not used automatically."), "Global toolchain policy is not encoded");
assert(runtime.includes('syntax: "vue"'), "LanguageClient must bind to Nova's lowercase vue syntax");
assert(!runtime.includes('syntax: "Vue"'), "LanguageClient must not bind to display name Vue");

const vueSyntax = fs.readFileSync(path.join(bundleRoot, "Syntaxes", "Vue.xml"), "utf8");
assert(vueSyntax.includes("<tree-sitter>"), "Vue syntax must enable Tree-sitter");
assert(!vueSyntax.includes("<template-scopes>"), "Regex template scopes should not be used in v1");

const clips = readJson("Clips.json");
assert(Array.isArray(clips.clips), "Clips.json must contain a clips array");
const clipLeaves = [];
function collectClipLeaves(items, pathParts = []) {
  for (const item of items) {
    const label = [...pathParts, item.name || "<unnamed>"].join(" > ");
    if (Array.isArray(item.children)) {
      collectClipLeaves(item.children, [...pathParts, item.name || "<unnamed>"]);
      continue;
    }
    clipLeaves.push({ item, label });
  }
}
collectClipLeaves(clips.clips);
assert(clipLeaves.length > 0, "Clips.json must contain at least one insertable clip");
for (const { item, label } of clipLeaves) {
  assert(typeof item.name === "string" && item.name.length > 0, `Clip is missing name: ${label}`);
  assert(typeof item.content === "string" && item.content.length > 0, `Clip is missing Nova content: ${label}`);
  assert(item.body === undefined, `Clip uses VS Code body instead of Nova content: ${label}`);
  assert(item.scopes === undefined, `Clip uses VS Code scopes instead of Nova scope/syntax: ${label}`);
  assert(item.scope === "editor", `Clip must use editor scope: ${label}`);
  assert(item.syntax === "vue", `Clip must target vue syntax: ${label}`);
  assert(typeof item.trigger === "string" && item.trigger.length > 0, `Clip is missing trigger: ${label}`);
}

assert(fs.existsSync(path.join(root, "src", "main.ts")), "Missing TypeScript source tree");
assert(fs.existsSync(path.join(root, "types", "nova.d.ts")), "Missing Nova TypeScript declarations");

console.log("Nova Vue extension verification passed.");
