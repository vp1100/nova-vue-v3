"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const bundleRoot = path.join(root, "Vue.novaextension");
const buildRoot = path.join(root, "build");

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit"
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run(process.execPath, [path.join(root, "tools", "verify-extension.js")]);

const manifest = JSON.parse(fs.readFileSync(path.join(bundleRoot, "extension.json"), "utf8"));
const output = path.join(buildRoot, `${manifest.name}.novaextension`);
const requiredBundlePaths = [
  "extension.json",
  "README.md",
  "CHANGELOG.md",
  "LICENSE",
  "extension.png",
  "Clips.json",
  "Images",
  "Syntaxes",
  "Queries",
  "Scripts",
  "Support"
];

if (!fs.existsSync(path.join(bundleRoot, "Support", "server", "node_modules"))) {
  console.error("Missing Vue.novaextension/Support/server/node_modules. Run: npm ci --omit=dev --prefix Vue.novaextension/Support/server");
  process.exit(2);
}

fs.rmSync(buildRoot, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

for (const relativePath of requiredBundlePaths) {
  const source = path.join(bundleRoot, relativePath);
  if (!fs.existsSync(source)) {
    continue;
  }
  const destination = path.join(output, relativePath);
  fs.cpSync(source, destination, {
    recursive: true,
    filter: (sourcePath) => !sourcePath.includes(`${path.sep}.git${path.sep}`)
  });
}

console.log(`Created ${path.relative(root, output)}`);
console.log("Open this .novaextension bundle in Nova. Its extension.json is at the bundle root.");
