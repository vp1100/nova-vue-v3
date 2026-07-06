import { ExtensionConfig } from "./config";
import { Toolchain } from "./paths";

export function info(message: string): void {
  console.log(message);
}

export function warn(message: string): void {
  console.warn(message);
}

export function error(message: string): void {
  console.error(message);
}

export function debug(config: ExtensionConfig | null, message: string): void {
  if (config?.debug) {
    console.log(`[Debug] ${message}`);
  }
}

export function lspDebug(config: ExtensionConfig | null, message: string): void {
  if (config?.lspLogs) {
    console.log(`[LSP] ${message}`);
  }
}

export function formatClientSyntaxes(syntaxes: Array<string | { syntax: string; languageId: string }>): string {
  return syntaxes
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }
      return `${item.syntax}=>${item.languageId}`;
    })
    .join(", ");
}

export function logToolchain(config: ExtensionConfig, toolchain: Toolchain): void {
  if (toolchain.server) {
    info(`server found (${toolchain.server.source})`);
    debug(config, `server path: ${toolchain.server.path}`);
  } else {
    warn("server not found");
  }

  if (toolchain.tsdk) {
    info(`typescript sdk found (${toolchain.tsdk.source})`);
    debug(config, `typescript sdk path: ${toolchain.tsdk.path}`);
  } else {
    warn("typescript sdk not found");
  }

  debug(config, `memory: ${config.maxOldSpaceSize} MB`);
  lspDebug(config, "raw LanguageClient logging enabled");
}
