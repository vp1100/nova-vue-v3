"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLanguageClient = createLanguageClient;
const logger_1 = require("../shared/logger");
const index_1 = require("../toolchain/index");
function createLanguageClient(config, toolchain, options) {
    const server = toolchain.server;
    const tsdk = toolchain.tsdk;
    const proxyScript = nova.path.join(nova.extension.path, "Support", "proxy", "vue-lsp-proxy.js");
    const tsserverPath = nova.path.join(tsdk.path, "tsserver.js");
    const pluginProbeLocation = nodeModulesRoot(server.path);
    const cwd = projectRootFromTsdk(tsdk.path) || nova.workspace.path || nova.extension.path;
    const serverOptions = {
        path: (0, index_1.nodeLauncher)(config),
        args: [
            ...(config.nodePath ? [] : ["node"]),
            proxyScript,
            "--vueServer",
            server.path,
            "--vueServerKind",
            server.kind,
            "--tsserver",
            tsserverPath,
            "--tsdk",
            tsdk.path,
            "--pluginProbeLocation",
            pluginProbeLocation,
            "--cwd",
            cwd,
            "--traceLsp",
            config.lspLogs ? "true" : "false",
        ],
        env: {
            NODE_OPTIONS: `--max-old-space-size=${options.maxOldSpaceSize}`,
        },
        type: "stdio",
    };
    const syntaxes = [
        { syntax: "vue", languageId: "vue" },
    ];
    const clientOptions = {
        syntaxes,
        initializationOptions: config.initializationOptions,
        debug: config.lspLogs,
    };
    (0, logger_1.debug)(config, `client syntaxes: ${(0, logger_1.formatClientSyntaxes)(syntaxes)}`);
    (0, logger_1.debug)(config, `initialization options keys: ${Object.keys(config.initializationOptions).join(", ") || "none"}`);
    (0, logger_1.debug)(config, `lsp transport: stdio`);
    (0, logger_1.debug)(config, `lsp command: ${serverOptions.path} ${serverOptions.args.join(" ")}`);
    (0, logger_1.debug)(config, `lsp proxy cwd: ${cwd}`);
    (0, logger_1.debug)(config, `node memory limit: ${options.maxOldSpaceSize} MB${options.temporaryMemoryRetry ? " (temporary retry)" : ""}`);
    (0, logger_1.debug)(config, `lsp logs: ${config.lspLogs ? "on" : "off"}`);
    return new LanguageClient("vue", "Vue Language Server", serverOptions, clientOptions);
}
function nodeModulesRoot(filePath) {
    const marker = "/node_modules/";
    const index = filePath.lastIndexOf(marker);
    if (index < 0) {
        return nova.path.join(nova.extension.path, "Support", "server", "node_modules");
    }
    return filePath.slice(0, index + marker.length - 1);
}
function projectRootFromTsdk(tsdk) {
    const marker = "/node_modules/typescript/lib";
    const index = tsdk.lastIndexOf(marker);
    if (index < 0) {
        return null;
    }
    return tsdk.slice(0, index);
}
