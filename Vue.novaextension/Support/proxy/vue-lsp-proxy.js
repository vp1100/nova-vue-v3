"use strict";

const { spawn } = require("child_process");
const path = require("path");
const { resolveNuxtGeneratedComponentDefinition } = require("./nuxt-definitions");
const {
  scheduleSmartDiagnostics,
  clearDiagnosticsSchedule,
  clearDiagnosticsTimers
} = require("./diagnostics-scheduler");

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
const DIAGNOSTICS_CACHE_TTL_MS = 5000;
const TS_COMPLETION_DATA_KEY = "__novaVueTsCompletion";
const NOVA_IDENTIFIER_TRIGGER_CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_$-";
const traceLspEnabled = args.traceLsp === "true" || process.env.VUE_LSP_PROXY_TRACE_LSP === "1";
const vueServerStderr = createRecentTextBuffer(40);
const tsserverStderr = createRecentTextBuffer(40);
let serverCapabilities = null;
let vueCodeActionProvider = false;
let vueSignatureHelpProvider = false;
let vueDiagnosticsEnabled = true;
let tsDiagnosticsEnabled = true;
let diagnosticsOnOpenEnabled = true;
let diagnosticsOnChangeEnabled = true;
let diagnosticsOnSaveEnabled = true;
let codeActionsEnabled = true;
let completionEnabled = true;
let completionAutoImportEnabled = true;
let fallbackToVueLanguageServerEnabled = true;
let typescriptServiceEnabled = true;
let typescriptFeatures = {
  hover: true,
  definition: true,
  implementation: true,
  references: true,
  rename: true,
  codeActions: true,
  signatureHelp: true
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
  process.exit(code && code !== 0 ? code : 1);
});

process.on("exit", () => {
  clearDiagnosticsTimers(diagnosticsTimers);
  clearDiagnosticsTimers(vueDiagnosticsTimers);
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

  if (message.method === "completionItem/resolve" && message.id !== undefined) {
    const handled = await tryResolveTsCompletion(message);
    if (handled) {
      return;
    }
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
        vueSignatureHelpProvider = Boolean(message.result?.capabilities?.signatureHelpProvider);
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
  return method === "textDocument/completion"
    || method === "textDocument/signatureHelp"
    || method === "textDocument/hover"
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
    if (message.method === "textDocument/completion") {
      if (!completionEnabled) {
        writeClient({ jsonrpc: "2.0", id: message.id, result: emptyCompletionList() });
        return true;
      }
      const [typescriptResult, vueResult] = await Promise.all([
        typescriptServiceEnabled
          ? tsCompletion(file, message.params?.position, message.params?.context).catch(() => emptyCompletionList())
          : Promise.resolve(emptyCompletionList()),
        fallbackToVueLanguageServerEnabled
          && shouldRequestVueCompletion(file, message.params?.position, message.params?.context)
          ? requestVue("textDocument/completion", normalizeCompletionParams(message.params)).catch((error) => {
            process.stderr.write(`[Vue LSP proxy] Vue completion failed: ${String(error?.message || error)}\n`);
            return emptyCompletionList();
          })
          : Promise.resolve(emptyCompletionList())
      ]);
      writeClient({
        jsonrpc: "2.0",
        id: message.id,
        result: mergeCompletionResults(
          typescriptResult,
          normalizeVueCompletionForNova(file, message.params?.position, vueResult)
        )
      });
      return true;
    }

    if (message.method === "textDocument/signatureHelp") {
      if (!typescriptFeatures.signatureHelp) {
        if (vueSignatureHelpProvider && fallbackToVueLanguageServerEnabled) {
          return false;
        }
        writeClient({ jsonrpc: "2.0", id: message.id, result: null });
        return true;
      }
      try {
        const result = await tsSignatureHelp(file, message.params?.position, message.params?.context);
        writeClient({ jsonrpc: "2.0", id: message.id, result });
        return true;
      } catch {
        if (vueSignatureHelpProvider && fallbackToVueLanguageServerEnabled) {
          return false;
        }
        writeClient({ jsonrpc: "2.0", id: message.id, result: null });
        return true;
      }
    }

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
  if (!completionEnabled) {
    delete enhanced.completionProvider;
  } else if (typescriptServiceEnabled) {
    const existingCompletion = enhanced.completionProvider;
    const triggerCharacters = new Set([".", "\"", "'", "`", "/", "@", "<", "#"]);
    for (const character of NOVA_IDENTIFIER_TRIGGER_CHARACTERS) {
      triggerCharacters.add(character);
    }
    if (
      existingCompletion
      && typeof existingCompletion === "object"
      && Array.isArray(existingCompletion.triggerCharacters)
    ) {
      for (const character of existingCompletion.triggerCharacters) {
        if (typeof character === "string") {
          triggerCharacters.add(character);
        }
      }
    }
    enhanced.completionProvider = {
      ...(existingCompletion && typeof existingCompletion === "object" ? existingCompletion : {}),
      triggerCharacters: [...triggerCharacters],
      resolveProvider: true
    };
  }
  if (typescriptFeatures.signatureHelp) {
    const existingSignatureHelp = enhanced.signatureHelpProvider;
    const triggerCharacters = new Set(["(", ",", "<"]);
    const retriggerCharacters = new Set([")"]);
    if (existingSignatureHelp && typeof existingSignatureHelp === "object") {
      for (const character of existingSignatureHelp.triggerCharacters || []) {
        if (typeof character === "string") {
          triggerCharacters.add(character);
        }
      }
      for (const character of existingSignatureHelp.retriggerCharacters || []) {
        if (typeof character === "string") {
          retriggerCharacters.add(character);
        }
      }
    }
    enhanced.signatureHelpProvider = {
      ...(existingSignatureHelp && typeof existingSignatureHelp === "object" ? existingSignatureHelp : {}),
      triggerCharacters: [...triggerCharacters],
      retriggerCharacters: [...retriggerCharacters]
    };
  }
  if (typescriptFeatures.hover) {
    enhanced.hoverProvider = true;
  }
  if (typescriptFeatures.definition) {
    enhanced.definitionProvider = true;
  }
  if (typescriptFeatures.implementation) {
    enhanced.implementationProvider = true;
  }
  if (typescriptFeatures.references) {
    enhanced.referencesProvider = true;
  }
  if (typescriptFeatures.rename) {
    const existingRename = enhanced.renameProvider;
    enhanced.renameProvider = {
      ...(existingRename && typeof existingRename === "object" ? existingRename : {}),
      prepareProvider: true
    };
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
  completionAutoImportEnabled = initializationOptions?.vue?.completion?.autoImport !== false;
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
    codeActions: typescriptServiceEnabled && typescript?.codeActions !== false,
    signatureHelp: typescriptNavigationEnabled && typescript?.signatureHelp !== false
  };
}

function emptyLanguageFeatureResult(method) {
  if (
    method === "textDocument/hover"
    || method === "textDocument/prepareRename"
    || method === "textDocument/rename"
    || method === "textDocument/signatureHelp"
  ) {
    return null;
  }
  if (method === "textDocument/completion") {
    return emptyCompletionList();
  }
  return [];
}

function emptyCompletionList() {
  return {
    isIncomplete: false,
    items: []
  };
}

async function tsCompletion(file, position, context) {
  if (!position) {
    return emptyCompletionList();
  }
  const requestArgs = {
    file,
    line: position.line + 1,
    offset: position.character + 1,
    includeExternalModuleExports: completionAutoImportEnabled,
    includeInsertTextCompletions: true
  };
  if (
    context?.triggerKind === 2
    && typeof context.triggerCharacter === "string"
    && !isNovaIdentifierTrigger(context.triggerCharacter)
  ) {
    requestArgs.triggerKind = context.triggerKind;
    requestArgs.triggerCharacter = context.triggerCharacter;
  } else if (context?.triggerKind === 2) {
    requestArgs.triggerKind = 1;
  } else if (typeof context?.triggerKind === "number") {
    requestArgs.triggerKind = context.triggerKind;
  }
  const result = unwrapTsserverResponse(await requestTsserver("completionInfo", requestArgs));
  if (!result || !Array.isArray(result.entries)) {
    return emptyCompletionList();
  }
  return {
    isIncomplete: result.isIncomplete === true,
    items: result.entries
      .filter((entry) => entry?.kind !== "warning" && typeof entry?.name === "string")
      .map((entry) => tsCompletionItem(file, position, entry, {
        fallbackReplacementSpan: result.optionalReplacementSpan,
        dotAccessor: result.isMemberCompletion ? completionDotAccessor(file, position) : null,
        defaultCommitCharacters: result.defaultCommitCharacters
      }))
  };
}

function tsCompletionItem(file, position, entry, context) {
  const insertText = typeof entry.insertText === "string" ? entry.insertText : entry.name;
  const isSnippet = entry.isSnippet === true;
  const item = {
    label: entry.name,
    kind: tsCompletionItemKind(entry.kind),
    sortText: entry.sortText,
    filterText: entry.filterText,
    insertText,
    insertTextFormat: isSnippet ? 2 : 1,
    preselect: entry.isRecommended === true,
    commitCharacters: Array.isArray(entry.commitCharacters)
      ? entry.commitCharacters
      : context?.defaultCommitCharacters,
    detail: completionEntryDetail(entry),
    data: {
      [TS_COMPLETION_DATA_KEY]: {
        file,
        position,
        name: entry.name,
        source: entry.source,
        entryData: entry.data
      }
    }
  };
  const entryReplacementRange = tsRangeToLsp(entry.replacementSpan?.start, entry.replacementSpan?.end);
  const fallbackReplacementRange = tsRangeToLsp(
    context?.fallbackReplacementSpan?.start,
    context?.fallbackReplacementSpan?.end
  );
  if (!entryReplacementRange && context?.dotAccessor && !isSnippet) {
    const accessorInsertText = context.dotAccessor.text + insertText;
    item.filterText = accessorInsertText;
    item.insertText = accessorInsertText;
    item.textEdit = {
      range: unionLspRanges(context.dotAccessor.range, fallbackReplacementRange),
      newText: accessorInsertText
    };
  } else {
    const replacementRange = entryReplacementRange || fallbackReplacementRange;
    if (replacementRange) {
      item.textEdit = {
        range: replacementRange,
        newText: insertText
      };
    }
  }
  if (typeof entry.kindModifiers === "string" && entry.kindModifiers.split(",").includes("deprecated")) {
    item.tags = [1];
  }
  return item;
}

function completionDotAccessor(file, position) {
  const text = documents.get(file)?.text;
  if (typeof text !== "string" || !position) {
    return null;
  }
  const line = text.split(/\r?\n/)[position.line] || "";
  const match = line.slice(0, position.character).match(/\??\.\s*$/);
  if (!match) {
    return null;
  }
  return {
    text: match[0],
    range: {
      start: {
        line: position.line,
        character: position.character - match[0].length
      },
      end: position
    }
  };
}

function unionLspRanges(first, second) {
  if (!second) {
    return first;
  }
  return {
    start: compareLspPositions(first.start, second.start) <= 0 ? first.start : second.start,
    end: compareLspPositions(first.end, second.end) >= 0 ? first.end : second.end
  };
}

function compareLspPositions(first, second) {
  if (first.line !== second.line) {
    return first.line - second.line;
  }
  return first.character - second.character;
}

function completionEntryDetail(entry) {
  const sourceDisplay = displayPartsText(entry.sourceDisplay);
  const labelDescription = entry.labelDetails?.description;
  if (sourceDisplay) {
    return sourceDisplay;
  }
  if (typeof labelDescription === "string" && labelDescription) {
    return labelDescription;
  }
  if (typeof entry.source === "string" && entry.source) {
    return entry.source;
  }
  return undefined;
}

function tsCompletionItemKind(kind) {
  const kinds = {
    method: 2,
    function: 3,
    constructor: 4,
    property: 10,
    getter: 10,
    setter: 10,
    var: 6,
    let: 6,
    const: 21,
    class: 7,
    interface: 8,
    module: 9,
    alias: 18,
    type: 25,
    enum: 13,
    "enum member": 20,
    keyword: 14,
    script: 17,
    directory: 19,
    "external module name": 9,
    string: 12,
    "primitive type": 25,
    label: 6
  };
  return kinds[kind] || 1;
}

function mergeCompletionResults(typescriptResult, vueResult) {
  const typescriptList = normalizeCompletionList(typescriptResult);
  const vueList = normalizeCompletionList(vueResult);
  const items = [];
  const seen = new Set();
  for (const item of [...typescriptList.items, ...vueList.items]) {
    if (!item || typeof item.label !== "string") {
      continue;
    }
    const insertText = item.textEdit?.newText || item.insertText || item.label;
    const key = `${item.label}\u0000${insertText}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    items.push(item);
  }
  return {
    isIncomplete: typescriptList.isIncomplete || vueList.isIncomplete,
    items
  };
}

function normalizeCompletionList(result) {
  if (Array.isArray(result)) {
    return {
      isIncomplete: false,
      items: result
    };
  }
  const itemDefaults = result?.itemDefaults;
  const applyKind = result?.applyKind;
  return {
    isIncomplete: result?.isIncomplete === true,
    items: Array.isArray(result?.items)
      ? result.items.map((item) => applyCompletionItemDefaults(item, itemDefaults, applyKind))
      : []
  };
}

function applyCompletionItemDefaults(item, defaults, applyKind) {
  if (!item || typeof item !== "object" || !defaults || typeof defaults !== "object") {
    return item;
  }
  const normalized = { ...item };
  if (normalized.commitCharacters == null && Array.isArray(defaults.commitCharacters)) {
    normalized.commitCharacters = defaults.commitCharacters;
  } else if (
    applyKind?.commitCharacters === 2
    && Array.isArray(defaults.commitCharacters)
    && Array.isArray(normalized.commitCharacters)
  ) {
    normalized.commitCharacters = [...new Set([...defaults.commitCharacters, ...normalized.commitCharacters])];
  }
  if (normalized.insertTextFormat == null && typeof defaults.insertTextFormat === "number") {
    normalized.insertTextFormat = defaults.insertTextFormat;
  }
  if (normalized.insertTextMode == null && typeof defaults.insertTextMode === "number") {
    normalized.insertTextMode = defaults.insertTextMode;
  }
  if (normalized.data == null) {
    normalized.data = defaults.data;
  } else if (
    applyKind?.data === 2
    && isPlainObject(defaults.data)
    && isPlainObject(normalized.data)
  ) {
    normalized.data = { ...defaults.data, ...normalized.data };
  }
  if (normalized.textEdit == null && defaults.editRange) {
    const newText = typeof normalized.textEditText === "string"
      ? normalized.textEditText
      : normalized.label;
    if (typeof newText === "string") {
      if (defaults.editRange.start && defaults.editRange.end) {
        normalized.textEdit = {
          range: defaults.editRange,
          newText
        };
      } else if (defaults.editRange.insert && defaults.editRange.replace) {
        normalized.textEdit = {
          insert: defaults.editRange.insert,
          replace: defaults.editRange.replace,
          newText
        };
      }
      if (normalized.textEdit) {
        delete normalized.textEditText;
      }
    }
  }
  return normalized;
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeCompletionParams(params) {
  const context = params?.context;
  if (
    context?.triggerKind !== 2
    || typeof context.triggerCharacter !== "string"
    || !isNovaIdentifierTrigger(context.triggerCharacter)
  ) {
    return params;
  }
  const normalizedContext = {
    ...context,
    triggerKind: 1
  };
  delete normalizedContext.triggerCharacter;
  return {
    ...params,
    context: normalizedContext
  };
}

function isNovaIdentifierTrigger(character) {
  return character.length === 1 && NOVA_IDENTIFIER_TRIGGER_CHARACTERS.includes(character);
}

function normalizeVueCompletionForNova(file, position, result) {
  const list = normalizeCompletionList(result);
  if (!isEmptyOpeningTagCompletion(file, position)) {
    return list;
  }
  return {
    ...list,
    items: list.items.map((item) => completionWithoutStaticTagEdit(item, position))
  };
}

function isEmptyOpeningTagCompletion(file, position) {
  const text = documents.get(file)?.text;
  if (typeof text !== "string" || !position) {
    return false;
  }
  const line = text.split(/\r?\n/)[position.line] || "";
  return line.slice(0, position.character).endsWith("<");
}

function completionWithoutStaticTagEdit(item, position) {
  if (!item || typeof item.label !== "string") {
    return item;
  }
  const textEdit = item.textEdit;
  if (!textEdit || !completionEditIsEmptyAt(textEdit, position)) {
    return item;
  }
  const insertion = item.textEdit?.newText || item.insertText || item.label;
  if (typeof insertion !== "string") {
    return item;
  }
  const filterText = typeof item.filterText === "string" ? item.filterText : insertion;
  const insertText = typeof item.insertText === "string" ? item.insertText : insertion;
  const { textEdit: _textEdit, textEditText: _textEditText, ...rest } = item;
  return {
    ...rest,
    filterText: filterText.startsWith("<") ? filterText : "<" + filterText,
    insertText: insertText.startsWith("<") ? insertText : "<" + insertText
  };
}

function completionEditIsEmptyAt(textEdit, position) {
  if (textEdit?.range) {
    return lspRangeIsEmptyAt(textEdit.range, position);
  }
  if (textEdit?.insert && textEdit?.replace) {
    return lspRangeIsEmptyAt(textEdit.insert, position)
      && lspRangeIsEmptyAt(textEdit.replace, position);
  }
  return false;
}

function lspRangeIsEmptyAt(range, position) {
  return compareLspPositions(range.start, position) === 0
    && compareLspPositions(range.end, position) === 0;
}

function shouldRequestVueCompletion(file, position, context) {
  const text = documents.get(file)?.text;
  if (typeof text !== "string" || !position) {
    return true;
  }
  const block = sfcBlockAtOffset(text, offsetAt(text, position));
  return block !== "script" || context?.triggerCharacter === "*";
}

function sfcBlockAtOffset(text, offset) {
  const openingTag = /<(template|script|style)\b[^>]*>/gi;
  let match;
  while ((match = openingTag.exec(text)) !== null) {
    const contentStart = openingTag.lastIndex;
    const closingTag = new RegExp(`</${match[1]}\\s*>`, "gi");
    closingTag.lastIndex = contentStart;
    const closingMatch = closingTag.exec(text);
    const contentEnd = closingMatch ? closingMatch.index : text.length;
    if (offset >= contentStart && offset <= contentEnd) {
      return match[1].toLowerCase();
    }
  }
  return null;
}

async function tryResolveTsCompletion(message) {
  const item = message.params;
  const data = item?.data?.[TS_COMPLETION_DATA_KEY];
  if (!data || typeof data.file !== "string" || !data.position || typeof data.name !== "string") {
    return false;
  }
  try {
    const detailsResult = unwrapTsserverResponse(await requestTsserver("completionEntryDetails", {
      file: data.file,
      line: data.position.line + 1,
      offset: data.position.character + 1,
      entryNames: [{
        name: data.name,
        source: data.source,
        data: data.entryData
      }],
      ...tsserverEditOptions()
    }));
    const details = Array.isArray(detailsResult) ? detailsResult[0] : null;
    if (!details) {
      writeClient({ jsonrpc: "2.0", id: message.id, result: item });
      return true;
    }
    const resolved = {
      ...item,
      detail: displayPartsText(details.displayParts) || item.detail,
      documentation: completionDocumentation(details) || item.documentation
    };
    const additionalTextEdits = completionAdditionalTextEdits(details.codeActions, data.file);
    if (additionalTextEdits.length > 0) {
      resolved.additionalTextEdits = additionalTextEdits;
    }
    writeClient({ jsonrpc: "2.0", id: message.id, result: resolved });
  } catch (error) {
    process.stderr.write(`[Vue LSP proxy] completion resolve failed: ${String(error?.message || error)}\n`);
    writeClient({ jsonrpc: "2.0", id: message.id, result: item });
  }
  return true;
}

function completionDocumentation(details) {
  const parts = [];
  const documentation = displayPartsText(details?.documentation);
  if (documentation) {
    parts.push(documentation);
  }
  for (const tag of details?.tags || []) {
    const text = displayPartsText(tag?.text);
    parts.push(text ? `*@${tag?.name || "tag"}* ${text}` : `*@${tag?.name || "tag"}*`);
  }
  if (parts.length === 0) {
    return undefined;
  }
  return {
    kind: "markdown",
    value: parts.join("\n\n")
  };
}

function completionAdditionalTextEdits(codeActions, file) {
  const edits = [];
  for (const action of codeActions || []) {
    for (const change of action?.changes || []) {
      if (change?.fileName !== file || !Array.isArray(change.textChanges)) {
        continue;
      }
      for (const textChange of change.textChanges) {
        const range = tsRangeToLsp(textChange?.start, textChange?.end);
        if (range) {
          edits.push({
            range,
            newText: textChange.newText || ""
          });
        }
      }
    }
  }
  return edits;
}

function displayPartsText(parts) {
  if (typeof parts === "string") {
    return parts;
  }
  if (!Array.isArray(parts)) {
    return "";
  }
  return parts.map((part) => typeof part === "string" ? part : part?.text || "").join("");
}

async function tsSignatureHelp(file, position, context) {
  if (!position) {
    return null;
  }
  const result = unwrapTsserverResponse(await requestTsserver("signatureHelp", {
    file,
    line: position.line + 1,
    offset: position.character + 1,
    triggerReason: tsSignatureHelpTriggerReason(context)
  }));
  if (!result || !Array.isArray(result.items) || result.items.length === 0) {
    return null;
  }
  return {
    signatures: result.items.map((item) => tsSignatureInformation(item)),
    activeSignature: Math.max(0, result.selectedItemIndex || 0),
    activeParameter: Math.max(0, result.argumentIndex || 0)
  };
}

function tsSignatureHelpTriggerReason(context) {
  if (context?.triggerKind === 2 && typeof context.triggerCharacter === "string") {
    return {
      kind: "characterTyped",
      triggerCharacter: context.triggerCharacter
    };
  }
  if (context?.triggerKind === 3) {
    return {
      kind: "retrigger",
      triggerCharacter: typeof context.triggerCharacter === "string" ? context.triggerCharacter : undefined
    };
  }
  return {
    kind: "invoked"
  };
}

function tsSignatureInformation(item) {
  const prefix = displayPartsText(item?.prefixDisplayParts);
  const suffix = displayPartsText(item?.suffixDisplayParts);
  const separator = displayPartsText(item?.separatorDisplayParts);
  const parameters = (item?.parameters || []).map((parameter) => ({
    label: displayPartsText(parameter?.displayParts) || parameter?.name || "",
    documentation: completionDocumentation(parameter)
  }));
  const signature = {
    label: `${prefix}${parameters.map((parameter) => parameter.label).join(separator)}${suffix}`,
    parameters
  };
  const documentation = completionDocumentation(item);
  if (documentation) {
    signature.documentation = documentation;
  }
  return signature;
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
      clearDiagnosticsSchedule(vueDiagnosticsTimers, file);
      clearDiagnosticsSchedule(diagnosticsTimers, file);
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
  scheduleSmartDiagnostics(vueDiagnosticsTimers, file, trigger, async (_scheduledTrigger, version) => {
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
  }, getDocumentVersion);
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
  scheduleSmartDiagnostics(diagnosticsTimers, file, trigger, async (scheduledTrigger, version) => {
    try {
      const current = documents.get(file);
      if (!current || current.version !== version) {
        return;
      }
      const diagnostics = await collectTsDiagnostics(file, { includeSuggestions: scheduledTrigger === "save" });
      const latest = documents.get(file);
      if (!latest || latest.version !== version) {
        return;
      }
      publishTsDiagnostics(file, diagnostics.map(tsDiagnosticToLsp).filter(Boolean));
    } catch (error) {
      process.stderr.write(`[Vue LSP proxy] TS diagnostics failed: ${String(error?.message || error)}\n`);
    }
  }, getDocumentVersion);
}

function getDocumentVersion(file) {
  return documents.get(file)?.version;
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
    || completionEnabled
    || typescriptFeatures.hover
    || typescriptFeatures.definition
    || typescriptFeatures.implementation
    || typescriptFeatures.references
    || typescriptFeatures.rename
    || typescriptFeatures.signatureHelp
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
