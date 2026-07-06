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

let nextId = 1;
let buffer = Buffer.alloc(0);
const pending = new Map();
const diagnostics = [];
const marks = new Map();

mark("spawn");
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
  stdio: ["pipe", "pipe", "pipe"]
});

bridge.stdout.on("data", (chunk) => {
  buffer = readMessages(buffer, chunk, (message) => {
    if (message.method === "textDocument/publishDiagnostics") {
      diagnostics.push({
        at: Date.now(),
        count: message.params?.diagnostics?.length ?? 0
      });
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
  process.stderr.write(chunk);
});

main().catch((error) => {
  bridge.kill();
  console.error(error);
  process.exit(1);
});

async function main() {
  const content = fs.readFileSync(vueFile, "utf8");
  await request("initialize", {
    processId: process.pid,
    rootUri: fileUri(fixtureRoot),
    rootPath: fixtureRoot,
    workspaceFolders: [{ uri: fileUri(fixtureRoot), name: "diagnostics" }],
    capabilities: {
      textDocument: {
        hover: { contentFormat: ["markdown", "plaintext"] },
        definition: { linkSupport: true },
        codeAction: { disabledSupport: true }
      },
      workspace: { configuration: true }
    },
    initializationOptions: {}
  });
  mark("initialize");
  notify("initialized", {});

  notify("textDocument/didOpen", {
    textDocument: {
      uri: fileUri(vueFile),
      languageId: "vue",
      version: 1,
      text: content
    }
  });
  mark("didOpen");

  let version = 1;
  for (let index = 0; index < 10; index += 1) {
    version += 1;
    notify("textDocument/didChange", {
      textDocument: { uri: fileUri(vueFile), version },
      contentChanges: [{
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 0 }
        },
        text: ""
      }]
    });
  }
  mark("tenChanges");

  await waitForDiagnostics();
  mark("diagnostics");

  await request("textDocument/hover", {
    textDocument: { uri: fileUri(vueFile) },
    position: { line: 5, character: 14 }
  });
  mark("hover");

  await request("textDocument/codeAction", {
    textDocument: { uri: fileUri(vueFile) },
    range: {
      start: { line: 5, character: 14 },
      end: { line: 5, character: 23 }
    },
    context: { diagnostics: [] }
  });
  mark("codeAction");

  bridge.kill();
  printReport();
}

function mark(name) {
  marks.set(name, Date.now());
}

function printReport() {
  const start = marks.get("spawn");
  const rows = [
    ["initialize", marks.get("initialize") - start],
    ["didOpen", marks.get("didOpen") - marks.get("initialize")],
    ["10 didChange notifications", marks.get("tenChanges") - marks.get("didOpen")],
    ["diagnostics after changes", marks.get("diagnostics") - marks.get("tenChanges")],
    ["hover", marks.get("hover") - marks.get("diagnostics")],
    ["codeAction", marks.get("codeAction") - marks.get("hover")]
  ];
  for (const [label, ms] of rows) {
    console.log(`${label}: ${ms}ms`);
  }
  console.log(`diagnostic publications: ${diagnostics.length}`);
  console.log(`latest diagnostic count: ${diagnostics.at(-1)?.count ?? 0}`);
}

function waitForDiagnostics() {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      if (diagnostics.length > 0) {
        clearInterval(timer);
        resolve();
        return;
      }
      if (Date.now() - started > 15000) {
        clearInterval(timer);
        reject(new Error("Timed out waiting for diagnostics"));
      }
    }, 50);
  });
}

function request(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    writeMessage({ jsonrpc: "2.0", id, method, params });
    setTimeout(() => {
      if (!pending.has(id)) {
        return;
      }
      pending.delete(id);
      reject(new Error(`Bridge request timed out: ${method}`));
    }, 15000);
  });
}

function notify(method, params) {
  writeMessage({ jsonrpc: "2.0", method, params });
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
