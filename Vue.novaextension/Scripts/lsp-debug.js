"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.summarizeLspResult = summarizeLspResult;
exports.stringifyCompact = stringifyCompact;
exports.summarizeCapabilities = summarizeCapabilities;

function summarizeLspResult(result) {
    if (result === null || result === undefined) {
        return "empty";
    }
    if (Array.isArray(result)) {
        return `${result.length} item(s)`;
    }
    if (typeof result !== "object") {
        return typeof result;
    }
    const value = result;
    if ("contents" in value) {
        return `hover ${summarizeHoverContents(value.contents)}`;
    }
    if ("uri" in value && "range" in value) {
        return `location ${formatUri(value.uri)}`;
    }
    if ("range" in value || "placeholder" in value) {
        return "rename available";
    }
    if ("edit" in value || "command" in value || "title" in value) {
        return `action ${typeof value.title === "string" ? value.title : "available"}`;
    }
    if ("signatures" in value) {
        const signatures = Array.isArray(value.signatures) ? value.signatures : [];
        return `signature help ${signatures.length} signature(s)`;
    }
    return `object keys: ${Object.keys(value).join(", ") || "none"}`;
}

function stringifyCompact(value) {
    const text = JSON.stringify(value);
    if (!text) {
        return String(value);
    }
    return text.length > 1200 ? `${text.slice(0, 1200)}...` : text;
}

function summarizeCapabilities(capabilities) {
    if (!capabilities) {
        return "unknown";
    }
    const keys = [
        "completionProvider",
        "hoverProvider",
        "definitionProvider",
        "implementationProvider",
        "referencesProvider",
        "renameProvider",
        "codeActionProvider",
        "documentFormattingProvider",
        "inlayHintProvider",
        "signatureHelpProvider",
        "semanticTokensProvider"
    ].filter((key) => Boolean(capabilities[key]));
    return keys.length > 0 ? keys.join(", ") : "none advertised";
}

function summarizeHoverContents(contents) {
    if (Array.isArray(contents)) {
        return `${contents.length} content item(s)`;
    }
    if (typeof contents === "string") {
        return contents.trim() ? "with text" : "empty text";
    }
    if (contents && typeof contents === "object") {
        const value = contents;
        if (typeof value.value === "string") {
            return value.value.trim() ? "with text" : "empty text";
        }
        return `object keys: ${Object.keys(value).join(", ") || "none"}`;
    }
    return "empty";
}

function formatUri(uri) {
    if (typeof uri !== "string") {
        return "unknown";
    }
    return uri.replace(/^file:\/\//, "");
}
