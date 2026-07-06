"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const serverScript = path.join(root, "Vue.novaextension", "Support", "server", "node_modules", "@vue", "language-server", "bin", "vue-language-server.js");
const tsdk = path.join(root, "Vue.novaextension", "Support", "server", "node_modules", "typescript", "lib");

if (!fs.existsSync(serverScript) || !fs.existsSync(tsdk)) {
  console.error("Bundled server is not installed. Run: npm install --prefix Vue.novaextension/Support/server");
  process.exit(2);
}

const result = spawnSync(process.execPath, [serverScript, "--version"], {
  encoding: "utf8"
});

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  console.error(result.stderr || result.stdout);
  process.exit(result.status);
}

console.log((result.stdout || result.stderr || "vue-language-server ok").trim());
