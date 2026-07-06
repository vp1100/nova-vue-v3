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
const vueFile = path.join(fixtureRoot, "script-type-error.vue");
const definitionFile = path.join(fixtureRoot, "invalid-prop.vue");
const missingImportFile = path.join(fixtureRoot, "missing-local-import.vue");
const expectedConfig = path.join(fixtureRoot, "tsconfig.json");

let nextId = 1;
let buffer = Buffer.alloc(0);
const pending = new Map();
let stderrText = "";

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
  fixtureRoot,
  "--traceLsp",
  "true"
], {
  cwd: fixtureRoot,
  stdio: ["pipe", "pipe", "pipe"]
});

bridge.stdout.on("data", (chunk) => {
  buffer = readMessages(buffer, chunk, (message) => {
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
  stderrText += text;
  if (!text.includes("[LSP]")) {
    process.stderr.write(chunk);
  }
});

bridge.on("exit", (code) => {
  if (code !== 0 && pending.size > 0) {
    for (const handler of pending.values()) {
      handler.reject(new Error(`Bridge exited with ${code}`));
    }
    pending.clear();
  }
});

main().catch((error) => {
  bridge.kill();
  console.error(error);
  process.exit(1);
});

async function main() {
  const content = fs.readFileSync(vueFile, "utf8");
  await request("vue/updateOpenFile", {
    file: vueFile,
    content
  });

  const projectInfo = await request("vue/tsserverRequest", {
    command: "_vue:projectInfo",
    args: {
      file: vueFile,
      needFileNameList: false
    }
  });

  if (!projectInfo || path.resolve(projectInfo.configFileName) !== expectedConfig) {
    throw new Error(`Unexpected projectInfo: ${JSON.stringify(projectInfo)}`);
  }

  const semanticDiagnostics = await request("vue/tsserverRequest", {
    command: "semanticDiagnosticsSync",
    args: {
      file: vueFile
    }
  });
  if (!Array.isArray(semanticDiagnostics) || !semanticDiagnostics.some((diagnostic) => diagnostic.code === 2322)) {
    throw new Error(`Expected TS2322 diagnostic: ${JSON.stringify(semanticDiagnostics)}`);
  }

  const initializeResult = await request("initialize", {
    processId: process.pid,
    rootUri: fileUri(fixtureRoot),
    rootPath: fixtureRoot,
    workspaceFolders: [{ uri: fileUri(fixtureRoot), name: "diagnostics" }],
    capabilities: {
      textDocument: {
        hover: { contentFormat: ["markdown", "plaintext"] },
        definition: { linkSupport: true }
      },
      workspace: {
        configuration: true
      }
    },
    initializationOptions: {}
  });
  if (!initializeResult?.capabilities?.codeActionProvider) {
    throw new Error(`Expected codeActionProvider capability: ${JSON.stringify(initializeResult?.capabilities)}`);
  }
  notify("initialized", {});
  notify("textDocument/didOpen", {
    textDocument: {
      uri: fileUri(vueFile),
      languageId: "vue",
      version: 1,
      text: content
    }
  });
  const definitionContent = fs.readFileSync(definitionFile, "utf8");
  notify("textDocument/didOpen", {
    textDocument: {
      uri: fileUri(definitionFile),
      languageId: "vue",
      version: 1,
      text: definitionContent
    }
  });
  const missingImportContent = fs.readFileSync(missingImportFile, "utf8");
  notify("textDocument/didOpen", {
    textDocument: {
      uri: fileUri(missingImportFile),
      languageId: "vue",
      version: 1,
      text: missingImportContent
    }
  });

  const hover = await request("textDocument/hover", {
    textDocument: { uri: fileUri(vueFile) },
    position: { line: 5, character: 8 }
  });
  if (!hover?.contents || !JSON.stringify(hover.contents).includes("message")) {
    throw new Error(`Expected proxy hover for message: ${JSON.stringify(hover)}`);
  }

  const definition = await request("textDocument/definition", {
    textDocument: { uri: fileUri(definitionFile) },
    position: { line: 5, character: 8 }
  });
  if (!Array.isArray(definition) || !definition.some((item) => item.uri && item.uri.endsWith("valid-child.vue"))) {
    throw new Error(`Expected proxy definition for DiagnosticChild: ${JSON.stringify(definition)}`);
  }

  const references = await request("textDocument/references", {
    textDocument: { uri: fileUri(definitionFile) },
    position: { line: 5, character: 8 },
    context: { includeDeclaration: true }
  });
  if (!Array.isArray(references) || references.length < 2) {
    throw new Error(`Expected proxy references for DiagnosticChild: ${JSON.stringify(references)}`);
  }

  const prepareRename = await request("textDocument/prepareRename", {
    textDocument: { uri: fileUri(definitionFile) },
    position: { line: 5, character: 8 }
  });
  if (!prepareRename?.range) {
    throw new Error(`Expected proxy prepareRename for DiagnosticChild: ${JSON.stringify(prepareRename)}`);
  }

  const rename = await request("textDocument/rename", {
    textDocument: { uri: fileUri(definitionFile) },
    position: { line: 5, character: 8 },
    newName: "RenamedDiagnosticChild"
  });
  if (!Array.isArray(rename?.documentChanges) || rename.documentChanges.length === 0) {
    throw new Error(`Expected proxy rename edits for DiagnosticChild: ${JSON.stringify(rename)}`);
  }

  const codeActions = await request("textDocument/codeAction", {
    textDocument: { uri: fileUri(missingImportFile) },
    range: {
      start: { line: 5, character: 14 },
      end: { line: 5, character: 23 }
    },
    context: {
      diagnostics: [
        {
          range: {
            start: { line: 5, character: 14 },
            end: { line: 5, character: 23 }
          },
          severity: 1,
          code: "TS2304",
          source: "ts",
          message: "Cannot find name 'makeTitle'."
        }
      ]
    }
  });
  if (!Array.isArray(codeActions) || !codeActions.some((action) => action.kind === "quickfix" && action.edit)) {
    throw new Error(`Expected proxy TypeScript code action: ${JSON.stringify(codeActions)}`);
  }

  if (!stderrText.includes("[Vue LSP proxy] LSP logs enabled")) {
    throw new Error("Expected LSP logs enabled marker when --traceLsp true");
  }
  if (!stderrText.includes('[LSP] client -> proxy: {"jsonrpc":"2.0","id":') || !stderrText.includes('"method":"initialize"')) {
    throw new Error("Expected LSP trace logs when VUE_LSP_PROXY_TRACE_LSP=1");
  }

  bridge.kill();
  console.log(`Vue LSP proxy tsserver smoke passed: ${projectInfo.configFileName}`);
}

function request(method, params) {
  const id = nextId++;
  const message = {
    jsonrpc: "2.0",
    id,
    method,
    params
  };
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    writeMessage(message);
    setTimeout(() => {
      if (!pending.has(id)) {
        return;
      }
      pending.delete(id);
      reject(new Error(`Bridge request timed out: ${method}`));
    }, 10000);
  });
}

function notify(method, params) {
  writeMessage({
    jsonrpc: "2.0",
    method,
    params
  });
}

function writeMessage(message) {
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
