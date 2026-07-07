"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.info = info;
exports.warn = warn;
exports.error = error;
exports.debug = debug;
exports.lspDebug = lspDebug;
exports.formatClientSyntaxes = formatClientSyntaxes;
exports.logToolchain = logToolchain;
function info(message) {
    console.log(message);
}
function warn(message) {
    console.warn(message);
}
function error(message) {
    console.error(message);
}
function debug(config, message) {
    if (config?.debug) {
        console.log(`[Debug] ${message}`);
    }
}
function lspDebug(config, message) {
    if (config?.lspLogs) {
        console.log(`[LSP] ${message}`);
    }
}
function formatClientSyntaxes(syntaxes) {
    return syntaxes
        .map((item) => {
        if (typeof item === "string") {
            return item;
        }
        return `${item.syntax}=>${item.languageId}`;
    })
        .join(", ");
}
function logToolchain(config, toolchain) {
    if (toolchain.server) {
        info(`server found (${toolchain.server.source})`);
        debug(config, `server path: ${toolchain.server.path}`);
    }
    else {
        warn("server not found");
    }
    if (toolchain.tsdk) {
        info(`typescript sdk found (${toolchain.tsdk.source})`);
        debug(config, `typescript sdk path: ${toolchain.tsdk.path}`);
    }
    else {
        warn("typescript sdk not found");
    }
    debug(config, `memory: ${config.maxOldSpaceSize} MB`);
    lspDebug(config, "raw LanguageClient logging enabled");
}
