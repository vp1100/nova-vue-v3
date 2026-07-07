"use strict";

const fs = require("fs");
const path = require("path");

function resolveNuxtGeneratedComponentDefinition(item) {
  if (!item?.file || !item.start || !isNuxtGeneratedComponentsFile(item.file)) {
    return null;
  }

  const line = readFileLine(item.file, item.start.line);
  if (!line) {
    return null;
  }

  const match = /typeof\s+import\((["'])([^"']+\.vue)\1\)\s*\[\s*(["'])default\3\s*\]/.exec(line);
  if (!match) {
    return null;
  }

  const target = path.resolve(path.dirname(item.file), match[2]);
  if (!fs.existsSync(target)) {
    return null;
  }

  return {
    uri: fileToUri(target),
    range: {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 0 }
    }
  };
}

function isNuxtGeneratedComponentsFile(file) {
  const normalized = file.split(path.sep).join("/");
  return normalized.includes("/.nuxt/") && normalized.endsWith("/components.d.ts");
}

function readFileLine(file, lineNumber) {
  try {
    const text = fs.readFileSync(file, "utf8");
    return text.split(/\r?\n/)[Math.max(0, lineNumber - 1)] || "";
  } catch {
    return "";
  }
}

function fileToUri(file) {
  return `file://${encodeURI(file).replace(/#/g, "%23")}`;
}

module.exports = {
  resolveNuxtGeneratedComponentDefinition
};
