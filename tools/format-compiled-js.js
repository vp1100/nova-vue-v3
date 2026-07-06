const fs = require("fs");
const path = require("path");

const scriptsDir = path.join(__dirname, "..", "Vue.novaextension", "Scripts");

function isTopLevelDeclaration(line) {
  return /^(function|class)\s/.test(line);
}

function isHeaderLine(line) {
  return (
    line === '"use strict";' ||
    line.startsWith("Object.defineProperty(") ||
    line.startsWith("exports.") ||
    /^const \w+_\d+ = require\("/.test(line)
  );
}

function shouldInsertBlankLine(previous, current) {
  if (!previous || previous === "" || current === "") {
    return false;
  }

  if (isTopLevelDeclaration(current)) {
    return true;
  }

  if (isHeaderLine(previous) && !isHeaderLine(current)) {
    return true;
  }

  if (/^const \w+_\d+ = require\("/.test(current) && !/^const \w+_\d+ = require\("/.test(previous)) {
    return true;
  }

  return false;
}

function formatJavaScript(source) {
  const lines = source.replace(/\n+$/, "").split("\n");
  const formatted = [];

  for (const line of lines) {
    const previous = formatted[formatted.length - 1];

    if (shouldInsertBlankLine(previous, line)) {
      formatted.push("");
    }

    formatted.push(line);
  }

  return `${formatted.join("\n")}\n`;
}

for (const entry of fs.readdirSync(scriptsDir)) {
  if (!entry.endsWith(".js")) {
    continue;
  }

  const filePath = path.join(scriptsDir, entry);
  const source = fs.readFileSync(filePath, "utf8");
  const formatted = formatJavaScript(source);

  if (formatted !== source) {
    fs.writeFileSync(filePath, formatted);
  }
}
