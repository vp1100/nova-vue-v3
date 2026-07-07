"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatNovaVersion = formatNovaVersion;
exports.formatMacOSVersion = formatMacOSVersion;
exports.readTextFile = readTextFile;
function formatNovaVersion() {
    const api = nova;
    if (typeof api.version === "string" && api.version.trim()) {
        return api.version;
    }
    if (typeof api.appVersion === "string" && api.appVersion.trim()) {
        return api.appVersion;
    }
    for (const path of [
        "/Applications/Nova.app/Contents/Info.plist",
        "/Applications/Nova Beta.app/Contents/Info.plist",
        "/Applications/Setapp/Nova.app/Contents/Info.plist"
    ]) {
        const version = matchPlistString(readTextFile(path), "CFBundleShortVersionString");
        if (version) {
            return version;
        }
    }
    return "unknown";
}
function formatMacOSVersion() {
    const text = readTextFile("/System/Library/CoreServices/SystemVersion.plist");
    const version = matchPlistString(text, "ProductUserVisibleVersion") ?? matchPlistString(text, "ProductVersion");
    return version ?? "unknown";
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
function matchPlistString(text, key) {
    if (!text) {
        return null;
    }
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = text.match(new RegExp(`<key>\\s*${escaped}\\s*<\\/key>\\s*<string>\\s*([^<]+)\\s*<\\/string>`));
    return match?.[1]?.trim() || null;
}
