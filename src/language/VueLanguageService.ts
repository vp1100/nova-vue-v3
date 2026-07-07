import type { ExtensionConfig } from "@/config/types";
import type { ServerStatus } from "@/status/types";
import type { Toolchain } from "@/toolchain/types";
import type { LanguageActionContext } from "./actions/context";

import { readConfig, resolveConfigurationSection } from "@/config/index";
import { summarizeCapabilities } from "@/lsp/debug";
import { fullText } from "@/lsp/position";
import { debug, error, info, logToolchain, warn } from "@/shared/logger";
import { createInitialStatus } from "@/status/index";
import { invalidateToolchainCache, resolveToolchain } from "@/toolchain/index";
import { TsserverBridge } from "@/tsserver/bridge";
import { logActiveEditorDebug, logWorkspaceDebug } from "@/workspace/debug";
import { isIgnoredWorkspacePath } from "@/workspace/paths";
import { isVueEditor } from "@/workspace/vue-editor";
import { createLanguageClient } from "./client-factory";
import { isOutOfMemoryError, memoryLimitMessage, suggestedMemoryLimit } from "./memory-retry";
import { validateNodePath } from "./node-validation";

export class VueLanguageService {
  private client: LanguageClient | null = null;
  private tsserverBridge: TsserverBridge | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private capabilitiesTimer: ReturnType<typeof setTimeout> | null = null;
  private lifecycle = 0;
  private preferBundledTsdkForNextStart = false;
  private memoryRetryUsed = false;
  private temporaryMaxOldSpaceSize: number | null = null;
  private expectedStop = false;
  public status: ServerStatus = createInitialStatus();

  ensureStarted(reason = "vue file opened"): void {
    if (this.client || this.status.state === "starting") {
      return;
    }
    this.start(reason);
  }

  start(reason = "start"): void {
    if (this.client || this.status.state === "starting") {
      debug(this.status.config, `language server already started; ignoring ${reason}`);
      return;
    }
    const config = readConfig();
    info(`starting language server (${reason})`);
    if (!config.serverEnabled) {
      this.status.config = config;
      this.status.state = "idle";
      this.status.running = false;
      this.status.diagnostics = "disabled";
      this.status.lastRestartReason = reason;
      this.status.lastError = "Vue language server is disabled in settings.";
      info("language server disabled by settings");
      return;
    }
    const nodeError = validateNodePath(config);
    if (nodeError) {
      this.status.config = config;
      this.status.state = "failed";
      this.status.running = false;
      this.status.diagnostics = "disabled";
      this.status.lastRestartReason = reason;
      this.status.lastError = nodeError;
      error(nodeError);
      nova.workspace.showErrorMessage(nodeError);
      return;
    }
    const preferBundledTsdk = this.preferBundledTsdkForNextStart;
    this.preferBundledTsdkForNextStart = false;
    const toolchain = resolveToolchain(config, { preferBundledTsdk });
    this.status.config = config;
    this.status.toolchain = toolchain;
    this.status.lastRestartReason = reason;
    this.status.lazyStart = false;
    this.status.diagnostics = "waiting";
    logToolchain(config, toolchain);
    logWorkspaceDebug(config, reason);
    logActiveEditorDebug(config, reason);

    if (!toolchain.server || !toolchain.tsdk) {
      this.status.state = "failed";
      this.status.running = false;
      this.status.diagnostics = "disabled";
      this.status.lastError = toolchain.errors.join("\n") || "Toolchain resolution failed.";
      error(this.status.lastError);
      nova.workspace.showErrorMessage(this.status.lastError);
      return;
    }

    const bridge = new TsserverBridge(config);
    try {
      bridge.prepareProxy();
    } catch (bridgeError) {
      this.status.state = "failed";
      this.status.running = false;
      this.status.diagnostics = "disabled";
      this.status.lastError = `TypeScript proxy failed to start: ${String(bridgeError)}`;
      error(this.status.lastError);
      nova.workspace.showErrorMessage(this.status.lastError);
      return;
    }
    this.tsserverBridge = bridge;
    this.status.tsserverBridge = bridge.status;

    const lifecycle = ++this.lifecycle;
    this.expectedStop = false;
    const client = createLanguageClient(config, toolchain, {
      maxOldSpaceSize: this.effectiveMaxOldSpaceSize(config),
      temporaryMemoryRetry: this.temporaryMaxOldSpaceSize !== null
    });
    this.registerWorkspaceConfigurationHandler(client, config);
    bridge.attach(client);
    this.client = client;
    this.status.state = "starting";
    this.status.running = false;

    client.onDidStop((error) => {
      if (lifecycle !== this.lifecycle) {
        debug(this.status.config, "ignoring stale language server stop event");
        return;
      }
      this.status.running = false;
      this.status.state = error ? "failed" : "idle";
      this.status.diagnostics = "disabled";
      this.status.lastError = error ? String(error) : null;
      this.status.tsserverBridge = this.tsserverBridge?.status ?? this.status.tsserverBridge;
      if (error) {
        warn(`language server stopped with error: ${String(error)}`);
      } else if (!this.expectedStop) {
        warn("language server stopped unexpectedly");
      } else {
        debug(this.status.config, "language server stopped");
      }
      this.expectedStop = false;
      if (error && this.handleMemoryError(config)) {
        return;
      }
      if (error && this.shouldTryBundledTsdkFallback(toolchain)) {
        this.status.fallbackRestartUsed = true;
        this.preferBundledTsdkForNextStart = true;
        warn("retrying with bundled TypeScript SDK");
        this.restart("typescript sdk fallback");
      }
    });

    try {
      client.start();
      this.status.running = true;
      this.status.state = "running";
      this.status.diagnostics = "enabled";
      info("language server started");
      this.scheduleCapabilitiesRefresh(lifecycle, client);
      this.refreshOpenVueEditors();
    } catch (startError) {
      bridge.stop();
      this.status.running = false;
      this.status.state = "failed";
      this.status.diagnostics = "disabled";
      this.status.lastError = String(startError);
      error(`language server failed to start: ${String(startError)}`);
      nova.workspace.showErrorMessage(this.status.lastError);
    }
  }

  stop(): void {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.capabilitiesTimer) {
      clearTimeout(this.capabilitiesTimer);
      this.capabilitiesTimer = null;
    }
    this.lifecycle += 1;
    if (this.client) {
      this.expectedStop = true;
      debug(this.status.config, "stopping language server");
      this.client.stop();
      this.client = null;
    }
    if (this.tsserverBridge) {
      this.tsserverBridge.stop();
      this.status.tsserverBridge = this.tsserverBridge.status;
      this.tsserverBridge = null;
    }
    this.status.running = false;
    this.status.state = "idle";
    this.status.diagnostics = "disabled";
  }

  restart(reason = "manual restart"): void {
    info(`restarting language server (${reason})`);
    this.stop();
    this.start(reason);
  }

  scheduleRestart(reason: string, delayMs = 1000): void {
    const nextConfig = readConfig();
    if (!nextConfig.restartOnConfigChange && reason === "configuration changed") {
      this.status.config = nextConfig;
      debug(this.status.config, "restart skipped because Restart On Configuration Change is disabled");
      return;
    }
    if (!this.client && this.status.state !== "starting") {
      this.status.config = nextConfig;
      debug(this.status.config, `restart skipped while idle: ${reason}`);
      return;
    }
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
    }
    debug(this.status.config, `restart scheduled: ${reason}`);
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.restart(reason);
    }, delayMs);
  }

  redetect(): void {
    this.status.fallbackRestartUsed = false;
    this.memoryRetryUsed = false;
    this.temporaryMaxOldSpaceSize = null;
    invalidateToolchainCache();
    this.restart("toolchain re-detect");
  }

  registerEditor(editor: TextEditor): Disposable[] {
    if (isVueEditor(editor) && !isIgnoredWorkspacePath(editor.document.path)) {
      this.ensureStarted("vue editor opened");
    }
    return [
      editor.document.onDidChangeSyntax(() => {
        if (isVueEditor(editor) && !isIgnoredWorkspacePath(editor.document.path)) {
          this.ensureStarted("document syntax changed to vue");
        }
      }),
      editor.onDidStopChanging((changedEditor) => {
        if (isVueEditor(changedEditor) && !isIgnoredWorkspacePath(changedEditor.document.path)) {
          this.ensureStarted("vue editor changed");
        }
      }),
      editor.onDidSave((savedEditor) => {
        if (isVueEditor(savedEditor) && !isIgnoredWorkspacePath(savedEditor.document.path)) {
          this.ensureStarted("vue editor saved");
        }
      })
    ];
  }

  private async syncEditorWithTsserver(editor: TextEditor): Promise<void> {
    if (!this.tsserverBridge || !editor.document.path) {
      return;
    }
    await this.tsserverBridge.updateVueFile(editor.document.path, fullText(editor));
  }

  private async collectTypeScriptDiagnostics(file: string): Promise<unknown[]> {
    if (!this.tsserverBridge) {
      return [];
    }
    return [
      ...((await this.tsserverBridge.request("syntacticDiagnosticsSync", { file })) as unknown[]),
      ...((await this.tsserverBridge.request("semanticDiagnosticsSync", { file })) as unknown[]),
      ...((await this.tsserverBridge.request("suggestionDiagnosticsSync", { file })) as unknown[])
    ];
  }

  private scheduleCapabilitiesRefresh(lifecycle: number, client: LanguageClient): void {
    if (this.capabilitiesTimer) {
      clearTimeout(this.capabilitiesTimer);
    }
    this.capabilitiesTimer = setTimeout(() => {
      this.capabilitiesTimer = null;
      if (lifecycle !== this.lifecycle || this.client !== client) {
        debug(this.status.config, "capabilities refresh skipped for stale language server");
        return;
      }
      this.refreshCapabilities(lifecycle);
    }, 500);
  }

  private async refreshCapabilities(lifecycle?: number): Promise<Record<string, unknown> | null> {
    if (!this.client) {
      return null;
    }
    try {
      const capabilities = (await this.client.sendRequest("vue/serverCapabilities")) as Record<string, unknown> | null;
      if (lifecycle !== undefined && lifecycle !== this.lifecycle) {
        return null;
      }
      this.status.capabilities = capabilities;
      debug(this.status.config, `server capabilities: ${summarizeCapabilities(capabilities)}`);
      return capabilities;
    } catch (capabilitiesError) {
      if (lifecycle !== undefined && lifecycle !== this.lifecycle) {
        debug(this.status.config, "capabilities refresh failed for stale language server");
        return null;
      }
      warn(`server capabilities unavailable: ${String(capabilitiesError)}`);
      return null;
    }
  }

  private refreshOpenVueEditors(): void {
    for (const editor of nova.workspace.textEditors) {
      if (isVueEditor(editor) && !isIgnoredWorkspacePath(editor.document.path)) {
        this.ensureStarted("vue editor refresh");
      }
    }
  }

  featureContext(): LanguageActionContext {
    return {
      ensureStarted: (reason) => this.ensureStarted(reason),
      client: () => this.client,
      tsserverBridge: () => this.tsserverBridge,
      debugConfig: () => this.status.config,
      syncEditorWithTsserver: (editor) => this.syncEditorWithTsserver(editor),
      collectTypeScriptDiagnostics: (file) => this.collectTypeScriptDiagnostics(file),
      refreshCapabilities: () => this.refreshCapabilities()
    };
  }

  private registerWorkspaceConfigurationHandler(client: LanguageClient, config: ExtensionConfig): void {
    client.onRequest("workspace/configuration", (params: unknown) => {
      const items = isRecord(params) && Array.isArray(params.items) ? params.items : [];
      const result = items.map((item) => {
        const section = isRecord(item) && typeof item.section === "string" ? item.section : undefined;
        return resolveConfigurationSection(section);
      });
      debug(config, `workspace/configuration: ${result.length} item(s)`);
      return result;
    });
  }

  private shouldTryBundledTsdkFallback(toolchain: Toolchain): boolean {
    if (this.status.fallbackRestartUsed || !toolchain.tsdk || toolchain.tsdk.source !== "workspace") {
      return false;
    }
    const error = (this.status.lastError || "").toLowerCase();
    return error.includes("typescript") || error.includes("tsdk") || error.includes("tsserverlibrary");
  }

  private effectiveMaxOldSpaceSize(config: ExtensionConfig): number {
    if (this.temporaryMaxOldSpaceSize && this.temporaryMaxOldSpaceSize > config.maxOldSpaceSize) {
      return this.temporaryMaxOldSpaceSize;
    }
    return config.maxOldSpaceSize;
  }

  private handleMemoryError(config: ExtensionConfig): boolean {
    const lastError = this.status.lastError || "";
    if (!isOutOfMemoryError(lastError)) {
      return false;
    }

    const currentLimit = this.effectiveMaxOldSpaceSize(config);
    const suggestedLimit = suggestedMemoryLimit(currentLimit);
    const message = memoryLimitMessage(currentLimit, suggestedLimit);

    warn(message);

    if (!config.memoryAutoRetryEnabled || this.memoryRetryUsed || suggestedLimit <= currentLimit) {
      nova.workspace.showErrorMessage(message);
      return true;
    }

    this.memoryRetryUsed = true;
    this.temporaryMaxOldSpaceSize = suggestedLimit;
    nova.workspace.showWarningMessage(`${message} Retrying once with ${suggestedLimit} MB for this session.`);
    this.restart("memory limit retry");
    return true;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
