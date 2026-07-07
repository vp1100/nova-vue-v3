import type { TsserverBridgeStatus } from "./types";
import type { ExtensionConfig } from "@/config/types";

import { lspDebug, warn } from "@/shared/logger";
import { relativeWorkspacePath } from "@/workspace/paths";

export type { TsserverBridgeStatus } from "./types";

export class TsserverBridge {
  private client: LanguageClient | null = null;
  private requestCount = 0;
  private errorCount = 0;
  private bridgePath: string | null = null;

  constructor(private readonly config: ExtensionConfig) {}

  get status(): TsserverBridgeStatus {
    return {
      running: this.client !== null,
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      path: this.bridgePath
    };
  }

  prepareProxy(): void {
    this.bridgePath = nova.path.join(nova.extension.path, "Support", "proxy", "vue-lsp-proxy.js");
  }

  stop(): void {
    this.client = null;
  }

  attach(client: LanguageClient): void {
    this.client = client;
  }

  async updateVueFile(file: string, content: string): Promise<void> {
    if (!this.client) {
      throw new Error("tsserver proxy is not running");
    }
    await this.client.sendRequest("vue/updateOpenFile", { file, content });
  }

  async request(command: string, args: unknown): Promise<unknown> {
    if (!this.client) {
      throw new Error("tsserver proxy is not running");
    }
    this.requestCount += 1;
    const startedAt = Date.now();
    const result = await this.client.sendRequest("vue/tsserverRequest", { command, args });
    this.logRequest(command, args, result, Date.now() - startedAt);
    return result;
  }

  private logRequest(command: string, args: unknown, result: unknown, durationMs: number, upstreamId?: number): void {
    const file = requestFile(args);
    const fileLabel = file ? relativeWorkspacePath(file) : "workspace";
    const prefix = upstreamId ? `TS proxy #${upstreamId}` : "TS proxy";

    if (command === "_vue:projectInfo") {
      const configFileName = projectInfoConfig(result);
      const configLabel = configFileName ? relativeWorkspacePath(configFileName) : "none";
      lspDebug(this.config, `${prefix}: projectInfo ${fileLabel} -> ${configLabel}, ${durationMs}ms`);
      if (configFileName?.includes("/dev/null/inferredProject")) {
        warn(`TS project inferred for ${fileLabel}; TypeScript diagnostics for Vue files may be incomplete`);
      }
      return;
    }

    if (command.endsWith("DiagnosticsSync")) {
      const summary = summarizeTsserverDiagnostics(result);
      lspDebug(this.config, `${prefix}: ${diagnosticsKind(command)} ${fileLabel} -> ${summary}, ${durationMs}ms`);
      return;
    }

    lspDebug(this.config, `${prefix}: ${command} ${fileLabel}, ${durationMs}ms`);
  }
}

export function createTsserverResponseParams(id: number, result: unknown): [[number, unknown]] {
  return [[id, result]];
}

function requestFile(args: unknown): string | null {
  if (args && typeof args === "object" && typeof (args as { file?: unknown }).file === "string") {
    return (args as { file: string }).file;
  }
  return null;
}

function projectInfoConfig(result: unknown): string | null {
  if (result && typeof result === "object" && typeof (result as { configFileName?: unknown }).configFileName === "string") {
    return (result as { configFileName: string }).configFileName;
  }
  return null;
}

function diagnosticsKind(command: string): string {
  if (command === "semanticDiagnosticsSync") {
    return "semantic diagnostics";
  }
  if (command === "syntacticDiagnosticsSync") {
    return "syntactic diagnostics";
  }
  if (command === "suggestionDiagnosticsSync") {
    return "suggestion diagnostics";
  }
  return command;
}

function summarizeTsserverDiagnostics(result: unknown): string {
  if (!Array.isArray(result) || result.length === 0) {
    return "clean";
  }

  let errors = 0;
  let warnings = 0;
  let suggestions = 0;
  let infos = 0;
  const codes: Array<string | number> = [];

  for (const diagnostic of result) {
    const category = diagnostic && typeof diagnostic === "object" ? (diagnostic as { category?: string }).category : undefined;
    if (category === "error") {
      errors += 1;
    } else if (category === "warning") {
      warnings += 1;
    } else if (category === "suggestion") {
      suggestions += 1;
    } else {
      infos += 1;
    }
    const code = diagnostic && typeof diagnostic === "object" ? (diagnostic as { code?: string | number }).code : undefined;
    if (code !== undefined && !codes.includes(code)) {
      codes.push(code);
    }
  }

  const parts = [
    `${result.length} issue(s)`,
    `${errors} error(s)`,
    `${warnings} warning(s)`,
    `${suggestions} hint(s)`
  ];
  if (infos > 0) {
    parts.push(`${infos} info`);
  }
  if (codes.length > 0) {
    parts.push(`codes: ${codes.map((code) => `TS${code}`).join(", ")}`);
  }
  return parts.join(", ");
}
