const fs = require("fs");
const path = require("path");

const scriptsRoot = path.join(__dirname, "..", "Vue.novaextension", "Scripts");

function removeJavaScriptFiles(directory) {
  if (!fs.existsSync(directory)) {
    return;
  }

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      removeJavaScriptFiles(entryPath);
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      fs.unlinkSync(entryPath);
    }
  }
}

removeJavaScriptFiles(scriptsRoot);
