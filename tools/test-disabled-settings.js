"use strict";

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const fixtureRoot = path.join(root, "test-workspaces", "diagnostics");
const proxyPath = path.join(root, "Vue.novaextension", "Support", "proxy", "vue-lsp-proxy.js");
const serverNodeModules = path.join(root, "Vue.novaextension", "Support", "server", "node_modules");
const vueServerPath = path.join(serverNodeModules, "@vue", "language-server", "bin", "vue-language-server.js");
const tsserverPath = path.join(serverNodeModules, "typescript", "lib", "tsserver.js");
const tsdk = path.join(serverNodeModules, "typescript", "lib");
const vueFile = path.join(fixtureRoot, "missing-local-import.vue");
const vueContent = fs.readFileSync(vueFile, "utf8");

const forbiddenFeatureCommands = [
  "syntacticDiagnosticsSync",
  "semanticDiagnosticsSync",
  "suggestionDiagnosticsSync",
  "getCodeFixes",
  "organizeImports",
  "_vue:quickinfo",
  "definition",
  "references",
  "rename"
];

const scenarios = [
  {
    name: "syntax-only mode",
    options: {
      proxy: { fallbackToVueLanguageServer: false },
      vue: {
        diagnostics: { enabled: false, vue: false, typescript: false, onOpen: false, onChange: false, onSave: false },
        codeActions: { enabled: false },
        completion: { enabled: false, autoImport: false },
        typescript: {
          enabled: false,
          navigation: false,
          hover: false,
          definition: false,
          references: false,
          rename: false,
          codeActions: false
        }
      }
    },
    async exercise(client) {
      await exerciseAllLanguageFeatures(client);
    },
    expect: {
      emptyResults: true,
      noDiagnostics: true,
      forbiddenCommands: ["open", "change", ...forbiddenFeatureCommands]
    }
  },
  {
    name: "diagnostics off, completion on",
    options: {
      proxy: { fallbackToVueLanguageServer: false },
      vue: {
        diagnostics: { enabled: false, vue: false, typescript: false, onOpen: false, onChange: false, onSave: false },
        codeActions: { enabled: false },
        completion: { enabled: true, autoImport: true },
        typescript: {
          enabled: true,
          navigation: false,
          hover: false,
          definition: false,
          references: false,
          rename: false,
          codeActions: false
        }
      }
    },
    async exercise(client) {
      await client.wait(1300);
    },
    expect: {
      noDiagnostics: true,
      forbiddenCommands: ["syntacticDiagnosticsSync", "semanticDiagnosticsSync", "suggestionDiagnosticsSync", "getCodeFixes"]
    }
  },
  {
    name: "completion off, diagnostics on",
    options: {
      proxy: { fallbackToVueLanguageServer: false },
      vue: {
        diagnostics: { enabled: true, vue: false, typescript: true, onOpen: true, onChange: true, onSave: false },
        codeActions: { enabled: false },
        completion: { enabled: false, autoImport: false },
        typescript: {
          enabled: true,
          navigation: false,
          hover: false,
          definition: false,
          references: false,
          rename: false,
          codeActions: false
        }
      }
    },
    async exercise(client) {
      await client.wait(1300);
    },
    expect: {
      requiredCommands: ["syntacticDiagnosticsSync", "semanticDiagnosticsSync"],
      forbiddenCommands: ["suggestionDiagnosticsSync", "getCodeFixes", "_vue:quickinfo"]
    }
  },
  {
    name: "diagnostic triggers off",
    options: {
      proxy: { fallbackToVueLanguageServer: false },
      vue: {
        diagnostics: { enabled: true, vue: true, typescript: true, onOpen: false, onChange: false, onSave: false },
        codeActions: { enabled: false },
        completion: { enabled: false, autoImport: false },
        typescript: {
          enabled: true,
          navigation: false,
          hover: false,
          definition: false,
          references: false,
          rename: false,
          codeActions: false
        }
      }
    },
    async exercise(client) {
      await client.wait(1300);
    },
    expect: {
      noDiagnostics: true,
      forbiddenCommands: ["syntacticDiagnosticsSync", "semanticDiagnosticsSync", "suggestionDiagnosticsSync", "getCodeFixes", "_vue:quickinfo"]
    }
  },
  {
    name: "fallback off",
    options: {
      proxy: { fallbackToVueLanguageServer: false },
      vue: {
        diagnostics: { enabled: false, vue: false, typescript: false, onOpen: false, onChange: false, onSave: false },
        codeActions: { enabled: false },
        completion: { enabled: false, autoImport: false },
        typescript: {
          enabled: true,
          navigation: false,
          hover: false,
          definition: false,
          references: false,
          rename: false,
          codeActions: false
        }
      }
    },
    async exercise(client) {
      const hover = await client.request("textDocument/hover", {
        textDocument: { uri: fileUri(vueFile) },
        position: { line: 5, character: 14 }
      });
      assertEmpty(hover, "fallback-off hover");
    },
    expect: {
      noDiagnostics: true,
      forbiddenCommands: ["open", "change", ...forbiddenFeatureCommands]
    }
  },
  {
    name: "codeActions off but hover on",
    options: {
      proxy: { fallbackToVueLanguageServer: false },
      vue: {
        diagnostics: { enabled: false, vue: false, typescript: false, onOpen: false, onChange: false, onSave: false },
        codeActions: { enabled: false },
        completion: { enabled: false, autoImport: false },
        typescript: {
          enabled: true,
          navigation: true,
          hover: true,
          definition: false,
          references: false,
          rename: false,
          codeActions: false
        }
      }
    },
    async exercise(client) {
      const hover = await client.request("textDocument/hover", {
        textDocument: { uri: fileUri(vueFile) },
        position: { line: 5, character: 14 }
      });
      if (!hover?.contents) {
        throw new Error(`Expected hover result when hover is enabled: ${JSON.stringify(hover)}`);
      }
      const codeActions = await client.request("textDocument/codeAction", {
        textDocument: { uri: fileUri(vueFile) },
        range: {
          start: { line: 5, character: 14 },
          end: { line: 5, character: 23 }
        },
        context: { diagnostics: [] }
      });
      assertEmpty(codeActions, "codeActions-off codeAction");
    },
    expect: {
      noDiagnostics: true,
      requiredCommands: ["_vue:quickinfo"],
      forbiddenCommands: ["getCodeFixes", "organizeImports", "definition", "references", "rename"]
    }
  }
];

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  for (const scenario of scenarios) {
    const client = createBridgeClient();
    try {
      const initializeResult = await initialize(client, scenario.options);
      if (scenario.options.vue.codeActions.enabled === false && initializeResult?.capabilities?.codeActionProvider) {
        throw new Error(`[${scenario.name}] Expected codeActionProvider to be disabled`);
      }
      openAndEditDocument(client);
      await scenario.exercise(client);
      await client.wait(250);
      assertScenario(client, scenario);
      console.log(`Disabled settings matrix passed: ${scenario.name}`);
    } finally {
      client.kill();
    }
  }
}

function createBridgeClient() {
  let nextId = 1;
  let buffer = Buffer.alloc(0);
  const pending = new Map();
  const diagnostics = [];
  const tsserverCommands = [];

  const bridge = spawn(process.execPath, [
    proxyPath,
    "--vueServer",
    vueServerPath,
    "--vueServerKind",
    "script",
    "--tsserver",
    tsserverPath,
    "--tsdk",
    tsdk,
    "--pluginProbeLocation",
    serverNodeModules,
    "--cwd",
    fixtureRoot
  ], {
    cwd: fixtureRoot,
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      VUE_LSP_PROXY_TRACE_TSSERVER: "1"
    }
  });

  bridge.stdout.on("data", (chunk) => {
    buffer = readMessages(buffer, chunk, (message) => {
      if (message.method === "textDocument/publishDiagnostics") {
        diagnostics.push(message.params);
        return;
      }
      const handler = pending.get(message.id);
      if (!handler) {
        return;
      }
      pending.delete(message.id);
      if (message.error) {
        handler.reject(new Error(message.error.message || "Bridge request failed"));
      } else {
        handler.resolve(message.result);
      }
    });
  });

  bridge.stderr.on("data", (chunk) => {
    const text = chunk.toString("utf8");
    const pattern = /\[Vue LSP proxy\] tsserver command: ([^\n]+)/g;
    let match = pattern.exec(text);
    while (match) {
      tsserverCommands.push(match[1]);
      match = pattern.exec(text);
    }
    process.stderr.write(chunk);
  });

  return {
    diagnostics,
    tsserverCommands,
    kill() {
      bridge.kill();
    },
    notify(method, params) {
      writeMessage(bridge, { jsonrpc: "2.0", method, params });
    },
    request(method, params) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        writeMessage(bridge, { jsonrpc: "2.0", id, method, params });
        setTimeout(() => {
          if (!pending.has(id)) {
            return;
          }
          pending.delete(id);
          reject(new Error(`Bridge request timed out: ${method}`));
        }, 15000);
      });
    },
    wait(ms) {
      return delay(ms);
    }
  };
}

async function initialize(client, initializationOptions) {
  const result = await client.request("initialize", {
    processId: process.pid,
    rootUri: fileUri(fixtureRoot),
    rootPath: fixtureRoot,
    workspaceFolders: [{ uri: fileUri(fixtureRoot), name: "diagnostics" }],
    capabilities: {
      textDocument: {
        hover: { contentFormat: ["markdown", "plaintext"] },
        definition: { linkSupport: true },
        references: {},
        rename: {},
        codeAction: { disabledSupport: true }
      },
      workspace: { configuration: true }
    },
    initializationOptions
  });
  client.notify("initialized", {});
  return result;
}

function openAndEditDocument(client) {
  client.notify("textDocument/didOpen", {
    textDocument: {
      uri: fileUri(vueFile),
      languageId: "vue",
      version: 1,
      text: vueContent
    }
  });
  client.notify("textDocument/didChange", {
    textDocument: { uri: fileUri(vueFile), version: 2 },
    contentChanges: [{
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 }
      },
      text: ""
    }]
  });
  client.notify("textDocument/didSave", {
    textDocument: { uri: fileUri(vueFile) }
  });
}

async function exerciseAllLanguageFeatures(client) {
  const textDocument = { uri: fileUri(vueFile) };
  const position = { line: 5, character: 14 };
  assertEmpty(await client.request("textDocument/hover", { textDocument, position }), "hover");
  assertEmpty(await client.request("textDocument/definition", { textDocument, position }), "definition");
  assertEmpty(await client.request("textDocument/references", { textDocument, position, context: { includeDeclaration: true } }), "references");
  assertEmpty(await client.request("textDocument/prepareRename", { textDocument, position }), "prepareRename");
  assertEmpty(await client.request("textDocument/rename", { textDocument, position, newName: "renamed" }), "rename");
  assertEmpty(await client.request("textDocument/codeAction", {
    textDocument,
    range: {
      start: { line: 5, character: 14 },
      end: { line: 5, character: 23 }
    },
    context: { diagnostics: [] }
  }), "codeAction");
  await client.wait(1300);
}

function assertScenario(client, scenario) {
  const commands = client.tsserverCommands;
  for (const command of scenario.expect.requiredCommands || []) {
    if (!commands.includes(command)) {
      throw new Error(`[${scenario.name}] Expected tsserver command: ${command}. Saw: ${commands.join(", ") || "none"}`);
    }
  }
  const forbidden = new Set(scenario.expect.forbiddenCommands || []);
  const unexpected = commands.filter((command) => forbidden.has(command));
  if (unexpected.length > 0) {
    throw new Error(`[${scenario.name}] Unexpected tsserver commands: ${unexpected.join(", ")}. All commands: ${commands.join(", ")}`);
  }
  if (scenario.expect.noDiagnostics && client.diagnostics.length > 0) {
    throw new Error(`[${scenario.name}] Disabled diagnostics still published ${client.diagnostics.length} diagnostic message(s)`);
  }
}

function assertEmpty(value, label) {
  if (value === null || value === undefined) {
    return;
  }
  if (Array.isArray(value) && value.length === 0) {
    return;
  }
  throw new Error(`Expected empty ${label} result: ${JSON.stringify(value)}`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function writeMessage(bridge, message) {
  const json = JSON.stringify(message);
  bridge.stdin.write(`Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n${json}`);
}

function fileUri(file) {
  return `file://${encodeURI(file).replace(/#/g, "%23")}`;
}

function readMessages(currentBuffer, chunk, callback) {
  currentBuffer = Buffer.concat([currentBuffer, chunk]);
  while (true) {
    const headerEnd = currentBuffer.indexOf("\r\n\r\n");
    if (headerEnd < 0) {
      return currentBuffer;
    }
    const header = currentBuffer.slice(0, headerEnd).toString("utf8");
    const match = /^Content-Length:\s*(\d+)/im.exec(header);
    if (!match) {
      currentBuffer = currentBuffer.slice(headerEnd + 4);
      continue;
    }
    const length = Number(match[1]);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + length;
    if (currentBuffer.length < bodyEnd) {
      return currentBuffer;
    }
    const raw = currentBuffer.slice(bodyStart, bodyEnd).toString("utf8");
    currentBuffer = currentBuffer.slice(bodyEnd);
    callback(JSON.parse(raw));
  }
}
