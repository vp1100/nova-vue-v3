"use strict";

const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const proxyPath = path.join(root, "Vue.novaextension", "Support", "proxy", "vue-lsp-proxy.js");
const serverNodeModules = path.join(root, "Vue.novaextension", "Support", "server", "node_modules");
const vueServerPath = path.join(serverNodeModules, "@vue", "language-server", "bin", "vue-language-server.js");
const tsserverPath = path.join(serverNodeModules, "typescript", "lib", "tsserver.js");
const tsdk = path.join(serverNodeModules, "typescript", "lib");
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "nova-vue-diagnostics-"));
const vueFile = path.join(workspace, "broken.vue");

fs.writeFileSync(path.join(workspace, "tsconfig.json"), JSON.stringify({
  compilerOptions: {
    strict: true
  },
  include: ["**/*"]
}, null, 2));
fs.writeFileSync(vueFile, "<template>\n  <div>\n</template>\n");

let nextId = 1;
let buffer = Buffer.alloc(0);
const pending = new Map();
const diagnostics = [];

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
  workspace
], {
  cwd: workspace,
  stdio: ["pipe", "pipe", "pipe"]
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
  process.stderr.write(chunk);
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
  const initializeResult = await request("initialize", {
    processId: process.pid,
    rootUri: fileUri(workspace),
    rootPath: workspace,
    workspaceFolders: [{ uri: fileUri(workspace), name: "vue-diagnostics" }],
    capabilities: {
      textDocument: {
        publishDiagnostics: {
          relatedInformation: true
        }
      },
      workspace: {
        configuration: true
      }
    },
    initializationOptions: {
      vue: {
        diagnostics: {
          enabled: true,
          vue: true,
          typescript: false,
          onOpen: true,
          onChange: true,
          onSave: true
        }
      }
    }
  });

  if (!initializeResult?.capabilities?.diagnosticProvider) {
    throw new Error(`Expected diagnosticProvider capability: ${JSON.stringify(initializeResult?.capabilities)}`);
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

  const published = await waitForDiagnostics();
  const vueDiagnostic = published.diagnostics.find((diagnostic) => diagnostic.source === "vue" && diagnostic.code === 24);
  if (!vueDiagnostic || !vueDiagnostic.message.includes("Element is missing end tag")) {
    throw new Error(`Expected Vue parse diagnostic: ${JSON.stringify(published.diagnostics)}`);
  }

  bridge.kill();
  fs.rmSync(workspace, { recursive: true, force: true });
  console.log("Vue diagnostics smoke passed");
}

function request(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    writeMessage({
      jsonrpc: "2.0",
      id,
      method,
      params
    });
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

function waitForDiagnostics() {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 10000;
    const timer = setInterval(() => {
      const latest = diagnostics.at(-1);
      if (latest?.diagnostics?.length > 0) {
        clearInterval(timer);
        resolve(latest);
        return;
      }
      if (Date.now() > deadline) {
        clearInterval(timer);
        reject(new Error("Timed out waiting for Vue diagnostics"));
      }
    }, 50);
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
