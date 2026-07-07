"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateNodePath = validateNodePath;
function validateNodePath(config) {
    if (!config.nodePath) {
        return null;
    }
    try {
        if (nova.fs.access(config.nodePath, nova.fs.R_OK) || nova.fs.access(config.nodePath, nova.fs.X_OK)) {
            return null;
        }
    }
    catch {
        // Fall through to the user-facing message below.
    }
    return [
        `Custom Node executable is not readable or executable: ${config.nodePath}`,
        "Choose a valid Node.js executable or clear the Node Executable setting to use /usr/bin/env node."
    ].join("\n");
}
