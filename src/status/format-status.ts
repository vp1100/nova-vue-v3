import type { ServerStatus } from "./types";

import { formatMacOSVersion, formatNovaVersion } from "./environment";
import { formatTypeScriptVersion, formatVueLanguageServerVersion } from "./package-version";
import { formatProjectStatus } from "./project";

export function formatStatus(status: ServerStatus): string {
  const toolchain = status.toolchain;
  const config = status.config;
  const project = formatProjectStatus();
  return [
    `Vue language server: ${status.state}`,
    `Running: ${status.running ? "yes" : "no"}`,
    `Lazy start: ${status.lazyStart ? "waiting for .vue file" : "started"}`,
    `Nova version: ${formatNovaVersion()}`,
    `macOS version: ${formatMacOSVersion()}`,
    ...project.lines,
    `Server: ${toolchain?.server ? `${toolchain.server.path} (${toolchain.server.source})` : "not resolved"}`,
    `Vue language server version: ${formatVueLanguageServerVersion(toolchain?.server ?? null, project.projectRoot)}`,
    `TypeScript SDK: ${toolchain?.tsdk ? `${toolchain.tsdk.path} (${toolchain.tsdk.source})` : "not resolved"}`,
    `TypeScript version: ${formatTypeScriptVersion(toolchain?.tsdk ?? null, project.projectRoot)}`,
    `Registered syntaxes: vue`,
    `Debug logs: ${config?.debug ? "on" : "off"}`,
    `LSP logs: ${config?.lspLogs ? "on" : "off"}`,
    `LSP capabilities: ${formatCapabilitySummary(status.capabilities)}`,
    `TS proxy: ${status.tsserverBridge?.running ? "running" : "stopped"}`,
    `TS proxy requests: ${status.tsserverBridge?.requestCount ?? 0}`,
    `TS proxy errors: ${status.tsserverBridge?.errorCount ?? 0}`,
    `LSP diagnostics: ${status.diagnostics}`,
    `Memory: ${config?.maxOldSpaceSize ?? 2048} MB`,
    `Last restart: ${status.lastRestartReason ?? "none"}`,
    `Last error: ${status.lastError ?? "none"}`,
    `Hints: ${toolchain?.hints.join(" ") ?? "none"}`,
    `Errors: ${toolchain?.errors.join(" ") ?? "none"}`
  ].join("\n");
}

function formatCapabilitySummary(capabilities: Record<string, unknown> | null): string {
  if (!capabilities) {
    return "unknown";
  }
  const supported = [
    ["completion", capabilities.completionProvider],
    ["hover", capabilities.hoverProvider],
    ["definition", capabilities.definitionProvider],
    ["implementation", capabilities.implementationProvider],
    ["references", capabilities.referencesProvider],
    ["rename", capabilities.renameProvider],
    ["codeAction", capabilities.codeActionProvider],
    ["formatting", capabilities.documentFormattingProvider],
    ["inlayHint", capabilities.inlayHintProvider],
    ["signatureHelp", capabilities.signatureHelpProvider],
    ["semanticTokens", capabilities.semanticTokensProvider]
  ]
    .filter(([, value]) => Boolean(value))
    .map(([name]) => name);
  return supported.length > 0 ? supported.join(", ") : "none advertised";
}
