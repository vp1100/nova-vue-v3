import type { ExtensionConfig } from "@/config/types";
import type { Toolchain } from "@/toolchain/types";

import { debug, formatClientSyntaxes } from "@/shared/logger";
import { nodeLauncher } from "@/toolchain/index";

interface CreateLanguageClientOptions {
  maxOldSpaceSize: number;
  temporaryMemoryRetry: boolean;
}

export function createLanguageClient(
  config: ExtensionConfig,
  toolchain: Toolchain,
  options: CreateLanguageClientOptions
): LanguageClient {
  const server = toolchain.server!;
  const tsdk = toolchain.tsdk!;
  const proxyScript = nova.path.join(nova.extension.path, "Support", "proxy", "vue-lsp-proxy.js");
  const tsserverPath = nova.path.join(tsdk.path, "tsserver.js");
  const pluginProbeLocation = nodeModulesRoot(server.path);
  const cwd = projectRootFromTsdk(tsdk.path) || nova.workspace.path || nova.extension.path;
  const serverOptions = {
    path: nodeLauncher(config),
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

  const syntaxes: Array<string | { syntax: string; languageId: string }> = [
    { syntax: "vue", languageId: "vue" },
  ];

  const clientOptions = {
    syntaxes,
    initializationOptions: config.initializationOptions,
    debug: config.lspLogs,
  };

  debug(config, `client syntaxes: ${formatClientSyntaxes(syntaxes)}`);
  debug(
    config,
    `initialization options keys: ${Object.keys(config.initializationOptions).join(", ") || "none"}`
  );
  debug(config, `lsp transport: stdio`);
  debug(config, `lsp command: ${serverOptions.path} ${serverOptions.args.join(" ")}`);
  debug(config, `lsp proxy cwd: ${cwd}`);
  debug(
    config,
    `node memory limit: ${options.maxOldSpaceSize} MB${
      options.temporaryMemoryRetry ? " (temporary retry)" : ""
    }`
  );
  debug(config, `lsp logs: ${config.lspLogs ? "on" : "off"}`);

  return new LanguageClient("vue", "Vue Language Server", serverOptions, clientOptions);
}

function nodeModulesRoot(filePath: string): string {
  const marker = "/node_modules/";
  const index = filePath.lastIndexOf(marker);
  if (index < 0) {
    return nova.path.join(nova.extension.path, "Support", "server", "node_modules");
  }
  return filePath.slice(0, index + marker.length - 1);
}

function projectRootFromTsdk(tsdk: string): string | null {
  const marker = "/node_modules/typescript/lib";
  const index = tsdk.lastIndexOf(marker);
  if (index < 0) {
    return null;
  }
  return tsdk.slice(0, index);
}
