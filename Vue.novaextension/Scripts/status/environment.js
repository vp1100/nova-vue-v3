"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatNovaVersion = formatNovaVersion;
exports.formatMacOSVersion = formatMacOSVersion;
exports.readTextFile = readTextFile;
function formatNovaVersion() {
    return nova.versionString.trim() || nova.version.join(".");
}
function formatMacOSVersion() {
    return nova.systemVersion.join(".");
}
function readTextFile(path) {
    try {
        const file = nova.fs.open(path);
        try {
            return file.read();
        }
        finally {
            file.close();
        }
    }
    catch {
        return null;
    }
}
