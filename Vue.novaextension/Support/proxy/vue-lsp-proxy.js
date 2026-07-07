"use strict";

const { spawn } = require("child_process");
const path = require("path");
const { resolveNuxtGeneratedComponentDefinition } = require("./nuxt-definitions");

const args = parseArgs(process.argv.slice(2));

if (!args.vueServer || !args.tsserver || !args.tsdk) {
  fatal("Missing --vueServer, --tsserver, or --tsdk");
}

const cwd = args.cwd || process.cwd();
const pluginProbeLocation = args.pluginProbeLocation || path.dirname(path.dirname(args.tsserver));
const vueServerKind = args.vueServerKind || "script";

let clientBuffer = Buffer.alloc(0);
let vueBuffer = Buffer.alloc(0);
let tsserverBuffer = Buffer.alloc(0);
let nextVueId = 1;
let nextClientId = 1;
let nextTsserverId = 1;

const clientToVueRequests = new Map();
const vueToClientRequests = new Map();
const proxyToVueRequests = new Map();
const pendingTsserver = new Map();
const documents = new Map();
const openedTsFiles = new Set();
const diagnosticsTimers = new Map();
const vueDiagnosticsTimers = new Map();
const diagnosticsCache = new Map();
const vueDiagnosticsByUri = new Map();
const tsDiagnosticsByUri = new Map();
const SERVER_REQUEST_TIMEOUT_MS = 15000;
const DIAGNOSTICS_CHANGE_DELAY_MS = 900;
const DIAGNOSTICS_SAVE_DELAY_MS = 100;
const DIAGNOSTICS_CACHE_TTL_MS = 5000;
const traceLspEnabled = args.traceLsp === "true" || process.env.VUE_LSP_PROXY_TRACE_LSP === "1";
const vueServerStderr = createRecentTextBuffer(40);
const tsserverStderr = createRecentTextBuffer(40);
let serverCapabilities = null;
let vueCodeActionProvider = false;
let vueDiagnosticsEnabled = true;
let tsDiagnosticsEnabled = true;
let diagnosticsOnOpenEnabled = true;
let diagnosticsOnChangeEnabled = true;
let diagnosticsOnSaveEnabled = true;
let codeActionsEnabled = true;
let completionEnabled = true;
let fallbackToVueLanguageServerEnabled = true;
let typescriptServiceEnabled = true;
let typescriptFeatures = {
  hover: true,
  definition: true,
  implementation: true,
  references: true,
  rename: true,
  codeActions: true
};

const vueServer = spawnVueServer();
if (traceLspEnabled) {
  process.stderr.write("[Vue LSP proxy] LSP logs enabled\n");
}
const tsserver = spawn(process.execPath, [
  args.tsserver,
  "--stdio",
  "--globalPlugins",
  "@vue/typescript-plugin",
  "--pluginProbeLocations",
  pluginProbeLocation,
  "--allowLocalPluginLoads"
], {
  cwd,
  stdio: ["pipe", "pipe", "pipe"]
});

process.stdin.on("data", (chunk) => {
  clientBuffer = readFramedMessages(clientBuffer, chunk, (message) => {
    logLspMessage("client -> proxy", message);
    handleClientMessage(message);
  });
});

vueServer.stdout.on("data", (chunk) => {
  vueBuffer = readFramedMessages(vueBuffer, chunk, (message) => {
    logLspMessage("server -> proxy", message);
    handleVueMessage(message);
  });
});

vueServer.stderr.on("data", (chunk) => {
  vueServerStderr.push(chunk);
  process.stderr.write(chunk);
});

vueServer.on("exit", (code, signal) => {
  logChildExit("vue-language-server", code, signal, vueServerStderr.text());
  process.exit(code ?? 1);
});

tsserver.stdout.on("data", (chunk) => {
  tsserverBuffer = readFramedMessages(tsserverBuffer, chunk, handleTsserverMessage);
});

tsserver.stderr.on("data", (chunk) => {
  tsserverStderr.push(chunk);
  process.stderr.write(chunk);
});

tsserver.on("exit", (code, signal) => {
  const stderr = tsserverStderr.text();
  logChildExit("tsserver", code, signal, stderr);
  for (const pending of pendingTsserver.values()) {
    clearTimeout(pending.timer);
    pending.reject(new Error(`tsserver exited (${code ?? signal ?? "unknown"})`));
  }
  pendingTsserver.clear();
  if (isOutOfMemoryText(stderr)) {
    process.exit(code ?? 1);
  }
});

process.on("exit", () => {
  for (const timer of diagnosticsTimers.values()) {
    clearTimeout(timer);
  }
  for (const timer of vueDiagnosticsTimers.values()) {
    clearTimeout(timer);
  }
  for (const pending of proxyToVueRequests.values()) {
    clearTimeout(pending.timer);
  }
  vueServer.kill();
  tsserver.kill();
});

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith("--") && index + 1 < argv.length) {
      parsed[arg.slice(2)] = argv[index + 1];
      index += 1;
    }
  }
  return parsed;
}

function spawnVueServer() {
  const command = vueServerKind === "script" ? process.execPath : args.vueServer;
  const serverArgs = vueServerKind === "script"
    ? [args.vueServer, "--stdio", `--tsdk=${args.tsdk}`]
    : ["--stdio", `--tsdk=${args.tsdk}`];
  return spawn(command, serverArgs, {
    cwd,
    stdio: ["pipe", "pipe", "pipe"],
    env: process.env
  });
}

function fatal(message) {
  process.stderr.write(`[Vue LSP proxy] ${message}\n`);
  process.exit(2);
}

function createRecentTextBuffer(maxLines) {
  let lines = [];
  return {
    push(chunk) {
      lines = lines.concat(chunk.toString("utf8").split(/\r?\n/));
      if (lines.length > maxLines) {
        lines = lines.slice(lines.length - maxLines);
      }
    },
    text() {
      return lines.join("\n");
    }
  };
}

function isOutOfMemoryText(text) {
  return /javascript heap out of memory|allocation failed|ineffective mark-compacts near heap limit|heap limit|fatal error/i.test(text || "");
}

function logChildExit(label, code, signal, stderr) {
  const oom = isOutOfMemoryText(stderr);
  process.stderr.write(`[Vue LSP proxy] child exit: ${label} code=${code ?? "none"} signal=${signal ?? "none"} oom=${oom ? "yes" : "no"}\n`);
  if (oom) {
    process.stderr.write("[Vue LSP proxy] out of memory detected. Increase Runtime & Paths > Node Memory Limit.\n");
  }
}

async function handleClientMessage(message) {
  if (message.method === "initialize") {
    readFeatureSettings(message.params?.initializationOptions);
    message = withServerFacingCapabilities(message);
  }

  if (message.method === "vue/updateOpenFile" && message.id !== undefined) {
    try {
      updateOpenFile(message.params?.file, message.params?.content);
      writeClient({ jsonrpc: "2.0", id: message.id, result: null });
    } catch (error) {
      writeClient(errorResponse(message.id, error));
    }
    return;
  }

  if (message.method === "vue/tsserverRequest" && message.id !== undefined) {
    try {
      const result = await requestTsserver(message.params?.command, message.params?.args);
      writeClient({ jsonrpc: "2.0", id: message.id, result: unwrapTsserverResponse(result) });
    } catch (error) {
      writeClient(errorResponse(message.id, error));
    }
    return;
  }

  if (message.method === "vue/serverCapabilities" && message.id !== undefined) {
    writeClient({ jsonrpc: "2.0", id: message.id, result: serverCapabilities });
    return;
  }

  updateDocumentFromClient(message);

  if (message.id !== undefined && isVueLanguageFeature(message.method)) {
    const handled = await tryHandleLanguageFeature(message);
    if (handled) {
      return;
    }
    if (!fallbackToVueLanguageServerEnabled) {
      writeClient({ jsonrpc: "2.0", id: message.id, result: emptyLanguageFeatureResult(message.method) });
      return;
    }
  }

  forwardClientToVue(message);
}

function handleVueMessage(message) {
  if (message.id !== undefined && !message.method) {
    const pending = proxyToVueRequests.get(message.id);
    if (pending !== undefined) {
      proxyToVueRequests.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) {
        pending.reject(new Error(message.error.message || "Vue server request failed"));
      } else {
        pending.resolve(message.result);
      }
      return;
    }
  }

  if (message.method === "tsserver/request") {
    handleVueTsserverRequest(message.params);
    return;
  }

  if (message.method === "textDocument/publishDiagnostics") {
    handleVueDiagnostics(message);
    return;
  }

  if (message.id !== undefined && message.method) {
    const clientId = nextClientId++;
    vueToClientRequests.set(clientId, {
      vueId: message.id,
      method: message.method,
      params: message.params
    });
    writeClient({ ...message, id: clientId });
    return;
  }

  if (message.id !== undefined && !message.method) {
    const pending = clientToVueRequests.get(message.id);
    if (pending !== undefined) {
      clientToVueRequests.delete(message.id);
      if (pending.method === "initialize") {
        serverCapabilities = enhanceServerCapabilities(message.result?.capabilities || null);
        vueCodeActionProvider = Boolean(message.result?.capabilities?.codeActionProvider);
        if (message.result) {
          message.result.capabilities = serverCapabilities;
        }
      }
      writeClient(normalizeVueResultForClient({ ...message, id: pending.clientId }, pending));
    }
    return;
  }

  writeClient(message);
}

function withServerFacingCapabilities(message) {
  const params = message.params && typeof message.params === "object" ? { ...message.params } : {};
  const capabilities = params.capabilities && typeof params.capabilities === "object" ? { ...params.capabilities } : {};
  const workspace = capabilities.workspace && typeof capabilities.workspace === "object"
    ? { ...capabilities.workspace }
    : {};
  capabilities.workspace = {
    ...workspace,
    diagnostics: {
      ...(workspace.diagnostics && typeof workspace.diagnostics === "object" ? workspace.diagnostics : {}),
      refreshSupport: Boolean(workspace.diagnostics?.refreshSupport)
    }
  };

  if (!codeActionsEnabled) {
    params.capabilities = capabilities;
    return {
      ...message,
      params
    };
  }

  const textDocument = capabilities.textDocument && typeof capabilities.textDocument === "object"
    ? { ...capabilities.textDocument }
    : {};
  const codeAction = textDocument.codeAction && typeof textDocument.codeAction === "object"
    ? { ...textDocument.codeAction }
    : {};
  textDocument.codeAction = {
    ...codeAction,
    disabledSupport: true
  };
  capabilities.textDocument = textDocument;
  params.capabilities = capabilities;
  return {
    ...message,
    params
  };
}

function handleClientResponse(message) {
  const pending = vueToClientRequests.get(message.id);
  if (pending === undefined) {
    return false;
  }
  vueToClientRequests.delete(message.id);
  writeVue(normalizeClientResultForVue({ ...message, id: pending.vueId }, pending));
  return true;
}

function normalizeClientResultForVue(message, pending) {
  if (pending?.method !== "workspace/configuration" || !Array.isArray(message.result)) {
    return message;
  }
  const items = Array.isArray(pending.params?.items) ? pending.params.items : [];
  return {
    ...message,
    result: message.result.map((value, index) => {
      const section = items[index]?.section;
      return section === "html.customData" || section === "css.customData" ? normalizeCustomDataPaths(value) : value;
    })
  };
}

function normalizeCustomDataPaths(value) {
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === "string" && item.trim().length > 0);
  }
  return [];
}

function handleVueDiagnostics(message) {
  if (!vueDiagnosticsEnabled && !tsDiagnosticsEnabled) {
    return;
  }
  const uri = message.params?.uri;
  if (typeof uri !== "string") {
    return;
  }
  const diagnostics = vueDiagnosticsEnabled && Array.isArray(message.params?.diagnostics) ? message.params.diagnostics : [];
  vueDiagnosticsByUri.set(uri, diagnostics);
  publishMergedDiagnostics(uri);
}

function forwardClientToVue(message) {
  if (message.id !== undefined && !message.method) {
    handleClientResponse(message);
    return;
  }

  if (message.id !== undefined && message.method) {
    const vueId = nextVueId++;
    clientToVueRequests.set(vueId, {
      clientId: message.id,
      method: message.method
    });
    writeVue({ ...message, id: vueId });
    return;
  }

  writeVue(message);
}

function normalizeVueResultForClient(message, pending) {
  if (pending?.method === "textDocument/codeAction" && Array.isArray(message.result)) {
    return {
      ...message,
      result: message.result.filter((action) => !action?.disabled)
    };
  }
  return message;
}

async function handleVueTsserverRequest(params) {
  const request = normalizeVueTsserverRequest(params);
  if (!request) {
    return;
  }

  if (!shouldForwardVueTsserverRequests()) {
    writeVue({
      jsonrpc: "2.0",
      method: "tsserver/response",
      params: [[request.id, undefined]]
    });
    return;
  }

  try {
    const response = await requestTsserver(request.command, request.args);
    writeVue({
      jsonrpc: "2.0",
      method: "tsserver/response",
      params: [[request.id, unwrapTsserverResponse(response)]]
    });
  } catch (error) {
    process.stderr.write(`[Vue LSP proxy] tsserver request failed: ${request.command}: ${String(error?.message || error)}\n`);
    writeVue({
      jsonrpc: "2.0",
      method: "tsserver/response",
      params: [[request.id, undefined]]
    });
  }
}

function normalizeVueTsserverRequest(params) {
  const payload = Array.isArray(params) && Array.isArray(params[0]) ? params[0] : null;
  if (!payload || typeof payload[0] !== "number" || typeof payload[1] !== "string") {
    return null;
  }
  return {
    id: payload[0],
    command: payload[1],
    args: payload[2]
  };
}

function isVueLanguageFeature(method) {
  return method === "textDocument/hover"
    || method === "textDocument/definition"
    || method === "textDocument/implementation"
    || method === "textDocument/references"
    || method === "textDocument/prepareRename"
    || method === "textDocument/rename"
    || method === "textDocument/codeAction";
}

async function tryHandleLanguageFeature(message) {
  const file = uriToFile(message.params?.textDocument?.uri);
  if (!file || !file.endsWith(".vue")) {
    return false;
  }

  try {
    if (message.method === "textDocument/codeAction") {
      if (!codeActionsEnabled) {
        writeClient({ jsonrpc: "2.0", id: message.id, result: [] });
        return true;
      }
      if (!typescriptFeatures.codeActions) {
        return false;
      }
      const result = await tsCodeActions(file, message.params);
      if (result.length > 0 || !vueCodeActionProvider) {
        writeClient({ jsonrpc: "2.0", id: message.id, result });
        return true;
      }
      return false;
    }

    const position = message.params?.position;
    if (!position) {
      return false;
    }

    if (message.method === "textDocument/hover") {
      if (!typescriptFeatures.hover) {
        return false;
      }
      const result = await tsHover(file, position);
      if (result) {
        writeClient({ jsonrpc: "2.0", id: message.id, result });
        return true;
      }
    }

    if (message.method === "textDocument/definition") {
      if (!typescriptFeatures.definition) {
        return false;
      }
      const result = await tsDefinition(file, position);
      if (Array.isArray(result) && result.length > 0) {
        writeClient({ jsonrpc: "2.0", id: message.id, result });
        return true;
      }
    }

    if (message.method === "textDocument/implementation") {
      if (!typescriptFeatures.implementation) {
        return false;
      }
      const result = await tsImplementation(file, position);
      writeClient({ jsonrpc: "2.0", id: message.id, result });
      return true;
    }

    if (message.method === "textDocument/references") {
      if (!typescriptFeatures.references) {
        return false;
      }
      const result = await tsReferences(file, position);
      if (Array.isArray(result) && result.length > 0) {
        writeClient({ jsonrpc: "2.0", id: message.id, result });
        return true;
      }
    }

    if (message.method === "textDocument/prepareRename") {
      if (!typescriptFeatures.rename) {
        return false;
      }
      const result = await tsPrepareRename(file, position);
      if (result) {
        writeClient({ jsonrpc: "2.0", id: message.id, result });
        return true;
      }
    }

    if (message.method === "textDocument/rename") {
      if (!typescriptFeatures.rename) {
        return false;
      }
      const result = await tsRename(file, position, message.params?.newName);
      if (result) {
        writeClient({ jsonrpc: "2.0", id: message.id, result });
        return true;
      }
    }
  } catch (error) {
    process.stderr.write(`[Vue LSP proxy] ${message.method} overlay failed: ${String(error?.message || error)}\n`);
  }

  return false;
}

function enhanceServerCapabilities(capabilities) {
  const enhanced = capabilities && typeof capabilities === "object" ? { ...capabilities } : {};
  if (typescriptFeatures.implementation) {
    enhanced.implementationProvider = true;
  }
  if (!codeActionsEnabled) {
    delete enhanced.codeActionProvider;
    return enhanced;
  }
  const existing = enhanced.codeActionProvider;
  if (!typescriptFeatures.codeActions) {
    return enhanced;
  }
  const kinds = new Set(["quickfix", "source.organizeImports"]);
  if (existing && typeof existing === "object" && Array.isArray(existing.codeActionKinds)) {
    for (const kind of existing.codeActionKinds) {
      if (typeof kind === "string") {
        kinds.add(kind);
      }
    }
  }
  enhanced.codeActionProvider = {
    ...(existing && typeof existing === "object" ? existing : {}),
    codeActionKinds: [...kinds]
  };
  return enhanced;
}

function readFeatureSettings(initializationOptions) {
  const diagnostics = initializationOptions?.vue?.diagnostics;
  if (diagnostics && typeof diagnostics === "object") {
    vueDiagnosticsEnabled = diagnostics.enabled !== false && diagnostics.vue !== false;
    tsDiagnosticsEnabled = diagnostics.enabled !== false && diagnostics.typescript !== false;
    diagnosticsOnOpenEnabled = diagnostics.onOpen !== false;
    diagnosticsOnChangeEnabled = diagnostics.onChange !== false;
    diagnosticsOnSaveEnabled = diagnostics.onSave !== false;
  } else {
    vueDiagnosticsEnabled = true;
    tsDiagnosticsEnabled = true;
    diagnosticsOnOpenEnabled = true;
    diagnosticsOnChangeEnabled = true;
    diagnosticsOnSaveEnabled = true;
  }

  codeActionsEnabled = initializationOptions?.vue?.codeActions?.enabled !== false;
  completionEnabled = initializationOptions?.vue?.completion?.enabled !== false;
  fallbackToVueLanguageServerEnabled = initializationOptions?.proxy?.fallbackToVueLanguageServer !== false;

  const typescript = initializationOptions?.vue?.typescript;
  typescriptServiceEnabled = typescript?.enabled !== false;
  const typescriptNavigationEnabled = typescriptServiceEnabled && typescript?.navigation !== false;
  typescriptFeatures = {
    hover: typescriptNavigationEnabled && typescript?.hover !== false,
    definition: typescriptNavigationEnabled && typescript?.definition !== false,
    implementation: typescriptNavigationEnabled && typescript?.implementation !== false,
    references: typescriptNavigationEnabled && typescript?.references !== false,
    rename: typescriptServiceEnabled && typescript?.rename !== false,
    codeActions: typescriptServiceEnabled && typescript?.codeActions !== false
  };
}

function emptyLanguageFeatureResult(method) {
  if (method === "textDocument/hover" || method === "textDocument/prepareRename" || method === "textDocument/rename") {
    return null;
  }
  return [];
}

async function tsHover(file, position) {
  const result = unwrapTsserverResponse(await requestTsserver("_vue:quickinfo", {
    file,
    line: position.line + 1,
    offset: position.character + 1
  }));
  if (!result?.displayString) {
    return null;
  }
  const documentation = formatDocumentation(result);
  return {
    contents: {
      kind: "markdown",
      value: documentation ? `\`\`\`ts\n${result.displayString}\n\`\`\`\n${documentation}` : `\`\`\`ts\n${result.displayString}\n\`\`\``
    },
    range: tsRangeToLsp(result.start, result.end)
  };
}

async function tsDefinition(file, position) {
  const result = unwrapTsserverResponse(await requestTsserver("definition", {
    file,
    line: position.line + 1,
    offset: position.character + 1
  }));
  if (!Array.isArray(result)) {
    return [];
  }
  return result.map((item) => resolveDefinitionLocation(item)).filter(Boolean);
}

async function tsImplementation(file, position) {
  const result = unwrapTsserverResponse(await requestTsserver("implementation", {
    file,
    line: position.line + 1,
    offset: position.character + 1
  }));
  if (!Array.isArray(result)) {
    return [];
  }
  return result.map((item) => tsLocationToLsp(item)).filter(Boolean);
}

async function tsReferences(file, position) {
  const result = unwrapTsserverResponse(await requestTsserver("references", {
    file,
    line: position.line + 1,
    offset: position.character + 1
  }));
  const refs = Array.isArray(result?.refs) ? result.refs : [];
  return refs.map((item) => tsLocationToLsp(item)).filter(Boolean);
}

async function tsPrepareRename(file, position) {
  const result = unwrapTsserverResponse(await requestTsserver("rename", {
    file,
    line: position.line + 1,
    offset: position.character + 1,
    findInStrings: false,
    findInComments: false
  }));
  if (!result?.info?.canRename || !result.info.triggerSpan) {
    return null;
  }
  return {
    range: tsRangeToLsp(result.info.triggerSpan.start, result.info.triggerSpan.end),
    placeholder: result.info.displayName || result.info.fullDisplayName || ""
  };
}

async function tsRename(file, position, newName) {
  if (typeof newName !== "string" || !newName) {
    return null;
  }
  const result = unwrapTsserverResponse(await requestTsserver("rename", {
    file,
    line: position.line + 1,
    offset: position.character + 1,
    findInStrings: false,
    findInComments: false
  }));
  if (!Array.isArray(result?.locs)) {
    return null;
  }
  const changes = [];
  for (const fileLocs of result.locs) {
    const uri = fileToUri(fileLocs.file);
    const edits = [];
    for (const loc of fileLocs.locs || []) {
      const range = tsRangeToLsp(loc.start, loc.end);
      if (range) {
        edits.push({ range, newText: newName });
      }
    }
    if (edits.length > 0) {
      changes.push({ textDocument: { uri, version: null }, edits });
    }
  }
  return changes.length > 0 ? { documentChanges: changes } : null;
}

async function tsCodeActions(file, params) {
  const range = params?.range;
  if (!range?.start || !range?.end) {
    return [];
  }

  const diagnostics = await collectTsDiagnostics(file, { includeSuggestions: false });
  const errorCodes = matchingDiagnosticCodes(diagnostics, range.start, range.end);
  if (errorCodes.length === 0) {
    return [];
  }

  const fixes = unwrapTsserverResponse(await requestTsserver("getCodeFixes", {
    file,
    startLine: range.start.line + 1,
    startOffset: range.start.character + 1,
    endLine: range.end.line + 1,
    endOffset: range.end.character + 1,
    errorCodes,
    ...tsserverEditOptions()
  }));
  if (!Array.isArray(fixes)) {
    return [];
  }

  const lspDiagnostics = Array.isArray(params?.context?.diagnostics) ? params.context.diagnostics : [];
  return fixes
    .filter((fix) => Array.isArray(fix?.changes) && fix.changes.some((change) => change.textChanges?.length > 0))
    .map((fix) => ({
      title: fix.description || fix.fixName || "Apply TypeScript quick fix",
      kind: "quickfix",
      diagnostics: lspDiagnostics,
      edit: tsserverChangesToWorkspaceEdit(fix.changes)
    }));
}

function updateDocumentFromClient(message) {
  if (message.method === "textDocument/didOpen") {
    const document = message.params?.textDocument;
    const file = uriToFile(document?.uri);
    if (file) {
      const text = document.text || "";
      documents.set(file, {
        uri: document.uri,
        version: document.version,
        text
      });
      if (shouldSyncTsserverDocuments()) {
        updateOpenFile(file, text);
      }
      scheduleVueDiagnostics(file, "open");
      scheduleTsDiagnostics(file, "open");
    }
    return;
  }

  if (message.method === "textDocument/didChange") {
    const document = message.params?.textDocument;
    const file = uriToFile(document?.uri);
    const state = file ? documents.get(file) : null;
    if (file && state) {
      for (const change of message.params?.contentChanges || []) {
        if (shouldSyncTsserverDocuments()) {
          applyTsserverTextChange(file, change);
        }
        state.text = applyTextChange(state.text, change);
      }
      state.version = document.version;
      invalidateDiagnostics(file);
      scheduleVueDiagnostics(file, "change");
      scheduleTsDiagnostics(file, "change");
    }
    return;
  }

  if (message.method === "textDocument/didSave") {
    const file = uriToFile(message.params?.textDocument?.uri);
    if (file) {
      invalidateDiagnostics(file);
      scheduleVueDiagnostics(file, "save");
      scheduleTsDiagnostics(file, "save");
    }
    return;
  }

  if (message.method === "textDocument/didClose") {
    const file = uriToFile(message.params?.textDocument?.uri);
    if (file) {
      const uri = message.params?.textDocument?.uri || fileToUri(file);
      vueDiagnosticsByUri.delete(uri);
      tsDiagnosticsByUri.delete(uri);
      const timer = vueDiagnosticsTimers.get(file);
      if (timer) {
        clearTimeout(timer);
        vueDiagnosticsTimers.delete(file);
      }
      publishMergedDiagnostics(uri);
      invalidateDiagnostics(file);
      documents.delete(file);
      closeTsserverFile(file);
    }
  }
}

function scheduleVueDiagnostics(file, trigger) {
  const state = documents.get(file);
  if (!state?.uri || !file.endsWith(".vue")) {
    return;
  }
  if (!vueDiagnosticsEnabled) {
    return;
  }
  if (!shouldRunDiagnosticsForTrigger(trigger)) {
    return;
  }
  const existing = vueDiagnosticsTimers.get(file);
  if (existing) {
    clearTimeout(existing);
  }
  const delay = trigger === "save" || trigger === "open" ? DIAGNOSTICS_SAVE_DELAY_MS : DIAGNOSTICS_CHANGE_DELAY_MS;
  const version = state.version;
  vueDiagnosticsTimers.set(file, setTimeout(async () => {
    vueDiagnosticsTimers.delete(file);
    try {
      const current = documents.get(file);
      if (!current || current.version !== version) {
        return;
      }
      const result = await requestVue("textDocument/diagnostic", {
        textDocument: {
          uri: current.uri
        }
      });
      const latest = documents.get(file);
      if (!latest || latest.version !== version) {
        return;
      }
      const diagnostics = Array.isArray(result?.items) ? result.items : [];
      vueDiagnosticsByUri.set(latest.uri, diagnostics);
      publishMergedDiagnostics(latest.uri);
    } catch (error) {
      const uri = documents.get(file)?.uri || fileToUri(file);
      process.stderr.write(`[Vue LSP proxy] Vue diagnostics failed for ${uri}: ${String(error?.message || error)}\n`);
    }
  }, delay));
}

function scheduleTsDiagnostics(file, trigger) {
  const state = documents.get(file);
  if (!state?.uri || !file.endsWith(".vue")) {
    return;
  }
  if (!tsDiagnosticsEnabled) {
    return;
  }
  if (!shouldRunDiagnosticsForTrigger(trigger)) {
    return;
  }
  const existing = diagnosticsTimers.get(file);
  if (existing) {
    clearTimeout(existing);
  }
  const delay = trigger === "save" || trigger === "open" ? DIAGNOSTICS_SAVE_DELAY_MS : DIAGNOSTICS_CHANGE_DELAY_MS;
  const version = state.version;
  diagnosticsTimers.set(file, setTimeout(async () => {
    diagnosticsTimers.delete(file);
    try {
      const current = documents.get(file);
      if (!current || current.version !== version) {
        return;
      }
      const diagnostics = await collectTsDiagnostics(file, { includeSuggestions: trigger === "save" });
      const latest = documents.get(file);
      if (!latest || latest.version !== version) {
        return;
      }
      publishTsDiagnostics(file, diagnostics.map(tsDiagnosticToLsp).filter(Boolean));
    } catch (error) {
      process.stderr.write(`[Vue LSP proxy] TS diagnostics failed: ${String(error?.message || error)}\n`);
    }
  }, delay));
}

function shouldRunDiagnosticsForTrigger(trigger) {
  if (trigger === "open") {
    return diagnosticsOnOpenEnabled;
  }
  if (trigger === "change") {
    return diagnosticsOnChangeEnabled;
  }
  if (trigger === "save") {
    return diagnosticsOnSaveEnabled;
  }
  return true;
}

function shouldSyncTsserverDocuments() {
  return typescriptServiceEnabled && (tsDiagnosticsEnabled
    || typescriptFeatures.hover
    || typescriptFeatures.definition
    || typescriptFeatures.implementation
    || typescriptFeatures.references
    || typescriptFeatures.rename
    || (codeActionsEnabled && typescriptFeatures.codeActions));
}

function shouldForwardVueTsserverRequests() {
  return typescriptServiceEnabled && (shouldSyncTsserverDocuments()
    || vueDiagnosticsEnabled
    || completionEnabled
    || codeActionsEnabled
    || fallbackToVueLanguageServerEnabled);
}

async function collectTsDiagnostics(file, options = {}) {
  const state = documents.get(file);
  const version = state?.version ?? null;
  const includeSuggestions = options.includeSuggestions === true;
  const cacheKey = `${file}:${version}:${includeSuggestions ? "with-suggestions" : "base"}`;
  const cached = diagnosticsCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < DIAGNOSTICS_CACHE_TTL_MS) {
    return cached.promise;
  }

  const promise = collectTsDiagnosticsUncached(file, includeSuggestions);
  diagnosticsCache.set(cacheKey, {
    createdAt: Date.now(),
    promise
  });
  return promise;
}

async function collectTsDiagnosticsUncached(file, includeSuggestions) {
  const diagnostics = [
    ...asArray(unwrapTsserverResponse(await requestTsserver("syntacticDiagnosticsSync", { file }))),
    ...asArray(unwrapTsserverResponse(await requestTsserver("semanticDiagnosticsSync", { file })))
  ];
  if (includeSuggestions) {
    diagnostics.push(...asArray(unwrapTsserverResponse(await requestTsserver("suggestionDiagnosticsSync", { file }))));
  }
  return diagnostics;
}

function invalidateDiagnostics(file) {
  for (const key of diagnosticsCache.keys()) {
    if (key.startsWith(`${file}:`)) {
      diagnosticsCache.delete(key);
    }
  }
}

function publishTsDiagnostics(file, diagnostics) {
  const uri = documents.get(file)?.uri || fileToUri(file);
  tsDiagnosticsByUri.set(uri, diagnostics);
  publishMergedDiagnostics(uri);
}

function publishMergedDiagnostics(uri) {
  const vueDiagnostics = vueDiagnosticsByUri.get(uri) || [];
  const tsDiagnostics = tsDiagnosticsByUri.get(uri) || [];
  const diagnostics = [...vueDiagnostics, ...tsDiagnostics];
  writeClient({
    jsonrpc: "2.0",
    method: "textDocument/publishDiagnostics",
    params: {
      uri,
      diagnostics
    }
  });
}

function applyTextChange(text, change) {
  if (!change.range) {
    return change.text || "";
  }
  const start = offsetAt(text, change.range.start);
  const end = offsetAt(text, change.range.end);
  return text.slice(0, start) + (change.text || "") + text.slice(end);
}

function updateOpenFile(file, content) {
  if (typeof file !== "string") {
    throw new Error("Missing file");
  }
  if (openedTsFiles.has(file)) {
    const currentText = documents.get(file)?.text;
    if (typeof content !== "string" || content === currentText) {
      return;
    }
    reloadTsserverFile(file, content);
    return;
  }
  openedTsFiles.add(file);
  writeTsserver({
    seq: nextTsserverId++,
    type: "request",
    command: "open",
    arguments: {
      file,
      fileContent: typeof content === "string" ? content : documents.get(file)?.text
    }
  });
}

function reloadTsserverFile(file, content) {
  closeTsserverFile(file);
  updateOpenFile(file, content);
}

function applyTsserverTextChange(file, change) {
  if (!openedTsFiles.has(file)) {
    updateOpenFile(file, documents.get(file)?.text);
    return;
  }
  if (!change?.range) {
    reloadTsserverFile(file, change?.text || "");
    return;
  }
  writeTsserver({
    seq: nextTsserverId++,
    type: "request",
    command: "change",
    arguments: {
      file,
      line: change.range.start.line + 1,
      offset: change.range.start.character + 1,
      endLine: change.range.end.line + 1,
      endOffset: change.range.end.character + 1,
      insertString: change.text || ""
    }
  });
}

function closeTsserverFile(file) {
  if (!openedTsFiles.has(file)) {
    return;
  }
  openedTsFiles.delete(file);
  writeTsserver({
    seq: nextTsserverId++,
    type: "request",
    command: "close",
    arguments: { file }
  });
}

function requestTsserver(command, requestArgs) {
  if (typeof command !== "string") {
    return Promise.reject(new Error("Missing tsserver command"));
  }

  const file = requestArgs && typeof requestArgs === "object" ? requestArgs.file : undefined;
  if (typeof file === "string" && !openedTsFiles.has(file)) {
    const text = documents.get(file)?.text;
    updateOpenFile(file, text);
  }

  const seq = nextTsserverId++;
  const request = {
    seq,
    type: "request",
    command,
    arguments: requestArgs
  };

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingTsserver.delete(seq);
      reject(new Error(`tsserver request timed out: ${command}`));
    }, SERVER_REQUEST_TIMEOUT_MS);
    pendingTsserver.set(seq, { resolve, reject, timer });
    writeTsserver(request);
  });
}

function requestVue(method, params) {
  if (typeof method !== "string") {
    return Promise.reject(new Error("Missing Vue server method"));
  }
  const id = nextVueId++;
  const request = {
    jsonrpc: "2.0",
    id,
    method,
    params
  };

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      proxyToVueRequests.delete(id);
      reject(new Error(`Vue server request timed out: ${method}`));
    }, SERVER_REQUEST_TIMEOUT_MS);
    proxyToVueRequests.set(id, { resolve, reject, timer });
    writeVue(request);
  });
}

function handleTsserverMessage(message) {
  if (message.type !== "response" || typeof message.request_seq !== "number") {
    return;
  }
  const pending = pendingTsserver.get(message.request_seq);
  if (!pending) {
    return;
  }
  pendingTsserver.delete(message.request_seq);
  clearTimeout(pending.timer);
  if (message.success === false) {
    pending.reject(new Error(message.message || `tsserver request failed: ${message.command}`));
    return;
  }
  pending.resolve(message);
}

function unwrapTsserverResponse(response) {
  const body = response?.body;
  if (body && typeof body === "object" && Object.prototype.hasOwnProperty.call(body, "response")) {
    return body.response;
  }
  return body;
}

function readFramedMessages(buffer, chunk, callback) {
  buffer = Buffer.concat([buffer, chunk]);
  while (true) {
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd < 0) {
      return buffer;
    }
    const header = buffer.slice(0, headerEnd).toString("utf8");
    const match = /^Content-Length:\s*(\d+)/im.exec(header);
    if (!match) {
      buffer = buffer.slice(headerEnd + 4);
      continue;
    }
    const length = Number(match[1]);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + length;
    if (buffer.length < bodyEnd) {
      return buffer;
    }
    const raw = buffer.slice(bodyStart, bodyEnd).toString("utf8");
    buffer = buffer.slice(bodyEnd);
    try {
      callback(JSON.parse(raw));
    } catch (error) {
      process.stderr.write(`[Vue LSP proxy] invalid JSON: ${String(error?.message || error)}\n`);
    }
  }
}

function writeClient(message) {
  logLspMessage("proxy -> client", message);
  writeFramed(process.stdout, message);
}

function writeVue(message) {
  logLspMessage("proxy -> server", message);
  writeFramed(vueServer.stdin, message);
}

function writeFramed(stream, message) {
  const json = JSON.stringify(message);
  stream.write(`Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n${json}`);
}

function writeTsserver(message) {
  if (process.env.VUE_LSP_PROXY_TRACE_TSSERVER === "1") {
    process.stderr.write(`[Vue LSP proxy] tsserver command: ${message.command || "unknown"}\n`);
  }
  tsserver.stdin.write(`${JSON.stringify(message)}\n`);
}

function logLspMessage(direction, message) {
  if (!traceLspEnabled) {
    return;
  }
  process.stderr.write(`[LSP] ${direction}: ${formatLspMessage(message)}\n`);
}

function formatLspMessage(message) {
  try {
    return JSON.stringify(message);
  } catch {
    return String(message);
  }
}

function errorResponse(id, error) {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code: -32000,
      message: String(error?.message || error)
    }
  };
}

function uriToFile(uri) {
  if (typeof uri !== "string" || !uri.startsWith("file://")) {
    return null;
  }
  return decodeURIComponent(uri.replace(/^file:\/\//, ""));
}

function fileToUri(file) {
  return `file://${encodeURI(file).replace(/#/g, "%23")}`;
}

function tsLocationToLsp(item) {
  if (!item?.file || !item.start || !item.end) {
    return null;
  }
  return {
    uri: fileToUri(item.file),
    range: tsRangeToLsp(item.start, item.end)
  };
}

function resolveDefinitionLocation(item) {
  return resolveNuxtGeneratedComponentDefinition(item) || tsLocationToLsp(item);
}

function tsRangeToLsp(start, end) {
  if (!start || !end) {
    return undefined;
  }
  return {
    start: {
      line: Math.max(0, start.line - 1),
      character: Math.max(0, start.offset - 1)
    },
    end: {
      line: Math.max(0, end.line - 1),
      character: Math.max(0, end.offset - 1)
    }
  };
}

function tsDiagnosticToLsp(diagnostic) {
  const range = tsRangeToLsp(diagnostic?.start, diagnostic?.end);
  if (!range) {
    return null;
  }
  return {
    range,
    severity: tsDiagnosticSeverity(diagnostic),
    code: diagnostic.code !== undefined ? `TS${diagnostic.code}` : undefined,
    source: "ts",
    message: diagnostic.text || "TypeScript diagnostic"
  };
}

function tsDiagnosticSeverity(diagnostic) {
  if (diagnostic?.category === "error") {
    return 1;
  }
  if (diagnostic?.category === "warning") {
    return 2;
  }
  if (diagnostic?.category === "suggestion" || diagnostic?.reportsUnnecessary) {
    return 4;
  }
  return 3;
}

function tsserverChangesToWorkspaceEdit(changes) {
  const documentChanges = [];
  for (const change of changes || []) {
    if (!change?.fileName || !Array.isArray(change.textChanges) || change.textChanges.length === 0) {
      continue;
    }
    documentChanges.push({
      textDocument: {
        uri: fileToUri(change.fileName),
        version: null
      },
      edits: change.textChanges
        .map((textChange) => ({
          range: tsRangeToLsp(textChange.start, textChange.end),
          newText: textChange.newText || ""
        }))
        .filter((edit) => Boolean(edit.range))
    });
  }
  return { documentChanges };
}

function matchingDiagnosticCodes(diagnostics, start, end) {
  const codes = [];
  for (const diagnostic of diagnostics || []) {
    if (diagnostic?.code === undefined || !diagnostic.start || !diagnostic.end) {
      continue;
    }
    const diagnosticStart = tsPositionToLsp(diagnostic.start);
    const diagnosticEnd = tsPositionToLsp(diagnostic.end);
    if (rangesOverlap(diagnosticStart, diagnosticEnd, start, end) && !codes.includes(diagnostic.code)) {
      codes.push(diagnostic.code);
    }
  }
  return codes;
}

function tsPositionToLsp(position) {
  return {
    line: Math.max(0, position.line - 1),
    character: Math.max(0, position.offset - 1)
  };
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  const aStartIndex = positionIndex(aStart);
  const aEndIndex = positionIndex(aEnd);
  const bStartIndex = positionIndex(bStart);
  const bEndIndex = positionIndex(bEnd);
  const cursor = bStartIndex === bEndIndex;
  if (cursor) {
    return bStartIndex >= aStartIndex && bStartIndex <= aEndIndex;
  }
  return aStartIndex <= bEndIndex && bStartIndex <= aEndIndex;
}

function positionIndex(position) {
  return position.line * 1000000 + position.character;
}

function tsserverEditOptions() {
  return {
    formatOptions: {
      semicolons: "remove"
    },
    preferences: {
      quotePreference: "single",
      importModuleSpecifierPreference: "shortest",
      includePackageJsonAutoImports: "auto",
      providePrefixAndSuffixTextForRename: true,
      semicolons: "remove"
    }
  };
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function offsetAt(text, position) {
  let line = 0;
  let character = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (line === position.line && character === position.character) {
      return index;
    }
    if (text.charCodeAt(index) === 10) {
      line += 1;
      character = 0;
    } else {
      character += 1;
    }
  }
  return text.length;
}

function formatDocumentation(info) {
  const parts = [];
  if (info.documentation) {
    parts.push(info.documentation);
  }
  if (Array.isArray(info.tags)) {
    for (const tag of info.tags) {
      if (tag?.text) {
        parts.push(`*@${tag.name || "tag"}* ${tag.text}`);
      }
    }
  }
  return parts.join("\n\n");
}
