import { ExtensionConfig, readConfig, resolveConfigurationSection } from "./config";
import { invalidateToolchainCache, resolveToolchain, nodeLauncher, Toolchain } from "./paths";
import { createInitialStatus, ServerStatus } from "./status";
import { debug, error, formatClientSyntaxes, info, logToolchain, warn } from "./logger";
import { logActiveEditorDebug, logWorkspaceDebug } from "./workspace-debug";
import { TsserverBridge } from "./tsserver-bridge";
import { isVueEditor } from "./vue-editor";
import { isIgnoredWorkspacePath } from "./workspace-paths";
import { applyTsserverFileEdits, applyWorkspaceEdit } from "./lsp-edits";
import { stringifyCompact, summarizeCapabilities, summarizeLspResult } from "./lsp-debug";
import { fullText, LspPosition, positionAt, rangesOverlap, symbolAt, tsPositionToLsp } from "./lsp-position";
import { TsserverCodeFix, TsserverDiagnosticForFix, TsserverFileEdit, tsserverEditOptions, WorkspaceEdit } from "./tsserver-types";
import { relativeWorkspacePath } from "./workspace-paths";

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
    const client = this.createClient(config, toolchain);
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

  async probeLspAtCursor(): Promise<void> {
    const editor = nova.workspace.activeTextEditor;
    if (!editor || !isVueEditor(editor)) {
      nova.workspace.showInformativeMessage("Open a .vue editor and place the cursor on a symbol first.");
      return;
    }

    this.ensureStarted("lsp probe");
    const client = this.client;
    if (!client) {
      nova.workspace.showInformativeMessage("Vue language server is not running yet.");
      return;
    }

    const path = editor.document.path!;
    const selection = editor.selectedRange as unknown as { start: number };
    const position = positionAt(editor, selection.start);
    const textDocument = { uri: editor.document.uri };
    const cursor = `${relativeWorkspacePath(path)}:${position.line + 1}:${position.character + 1}`;
    info(`LSP probe: ${cursor}`);

    const probes: Array<{ label: string; method: string; params: Record<string, unknown> }> = [
      {
        label: "hover",
        method: "textDocument/hover",
        params: { textDocument, position }
      },
      {
        label: "definition",
        method: "textDocument/definition",
        params: { textDocument, position }
      },
      {
        label: "references",
        method: "textDocument/references",
        params: { textDocument, position, context: { includeDeclaration: true } }
      },
      {
        label: "prepareRename",
        method: "textDocument/prepareRename",
        params: { textDocument, position }
      },
      {
        label: "codeAction",
        method: "textDocument/codeAction",
        params: {
          textDocument,
          range: { start: position, end: position },
          context: { diagnostics: [] }
        }
      },
      {
        label: "signatureHelp",
        method: "textDocument/signatureHelp",
        params: {
          textDocument,
          position,
          context: {
            triggerKind: 1
          }
        }
      }
    ];

    for (const probe of probes) {
      const startedAt = Date.now();
      try {
        const result = await client.sendRequest(probe.method, probe.params);
        info(`LSP probe ${probe.label}: ${summarizeLspResult(result)}, ${Date.now() - startedAt}ms`);
        debug(this.status.config, `LSP probe ${probe.label} raw: ${stringifyCompact(result)}`);
      } catch (probeError) {
        warn(`LSP probe ${probe.label} failed: ${String(probeError)}`);
      }
    }

    nova.workspace.showInformativeMessage("Vue LSP probe finished. Check the Extension Console.");
  }

  async copyLspCapabilities(): Promise<void> {
    this.ensureStarted("copy lsp capabilities");
    const capabilities = await this.refreshCapabilities();
    if (!capabilities) {
      nova.workspace.showInformativeMessage("Vue LSP capabilities are not available yet.");
      return;
    }
    await nova.clipboard.writeText(JSON.stringify(capabilities, null, 2));
    nova.workspace.showInformativeMessage("Vue LSP capabilities copied to clipboard.");
  }

  async renameSymbol(candidate?: unknown): Promise<void> {
    const editor = textEditorOrActive(candidate);
    if (!editor || !isVueEditor(editor)) {
      nova.workspace.showInformativeMessage("Open a .vue editor and place the cursor on a symbol first.");
      return;
    }
    this.ensureStarted("rename symbol");
    const client = this.client;
    if (!client) {
      nova.workspace.showInformativeMessage("Vue language server is not running yet.");
      return;
    }

    editor.selectWordsContainingCursors();
    const selectedRange = editor.selectedRange as unknown as { start: number };
    const selectedText = editor.selectedText || symbolAt(editor, selectedRange.start);
    const position = positionAt(editor, selectedRange.start);
    const newName = await inputPalette("New name for symbol", selectedText);
    if (!newName || newName === selectedText) {
      return;
    }

    const edit = await client.sendRequest("textDocument/rename", {
      textDocument: { uri: editor.document.uri },
      position,
      newName
    });
    if (!edit) {
      nova.workspace.showWarningMessage("Couldn't rename symbol.");
      return;
    }
    await applyWorkspaceEdit(edit as WorkspaceEdit);
    await nova.workspace.openFile(editor.document.uri);
    editor.scrollToCursorPosition();
  }

  async quickFix(candidate?: unknown): Promise<void> {
    const editor = textEditorOrActive(candidate);
    if (!editor || !isVueEditor(editor)) {
      nova.workspace.showInformativeMessage("Open a .vue editor and place the cursor on a Vue TypeScript issue first.");
      return;
    }
    const config = readConfig();
    if (!config.codeActionsEnabled || !config.typescriptCodeActionsEnabled) {
      nova.workspace.showInformativeMessage("Vue code actions are disabled in settings.");
      return;
    }
    this.ensureStarted("quick fix");
    if (!this.tsserverBridge) {
      nova.workspace.showInformativeMessage("TypeScript proxy is not running yet.");
      return;
    }

    const file = editor.document.path;
    if (!file) {
      return;
    }
    await this.syncEditorWithTsserver(editor);
    const range = editor.selectedRange as unknown as { start: number; end: number };
    const start = positionAt(editor, range.start);
    const end = positionAt(editor, range.end || range.start);
    const diagnostics = (await this.collectTypeScriptDiagnostics(file)) as TsserverDiagnosticForFix[];
    const errorCodes = matchingDiagnosticCodes(diagnostics, start, end);
    if (errorCodes.length === 0) {
      nova.workspace.showInformativeMessage("No TypeScript quick fixes at the cursor.");
      return;
    }

    const fixes = (await this.tsserverBridge.request("getCodeFixes", {
      file,
      startLine: start.line + 1,
      startOffset: start.character + 1,
      endLine: end.line + 1,
      endOffset: end.character + 1,
      errorCodes,
      ...tsserverEditOptions()
    })) as TsserverCodeFix[];

    const applicableFixes = Array.isArray(fixes)
      ? fixes.filter((fix) => fix.changes.some((change) => change.textChanges.length > 0))
      : [];
    if (applicableFixes.length === 0) {
      nova.workspace.showInformativeMessage("No TypeScript quick fixes available.");
      return;
    }

    const choice = await choicePalette(applicableFixes.map((fix) => fix.description), "Choose a Vue quick fix");
    const selectedFix = choice === null ? null : applicableFixes[choice];
    if (!selectedFix) {
      return;
    }
    await applyTsserverFileEdits(selectedFix.changes);
  }

  async addMissingImports(candidate?: unknown): Promise<void> {
    const editor = textEditorOrActive(candidate);
    if (!editor || !isVueEditor(editor)) {
      nova.workspace.showInformativeMessage("Open a .vue editor first.");
      return;
    }
    const config = readConfig();
    if (!config.codeActionsEnabled || !config.typescriptCodeActionsEnabled) {
      nova.workspace.showInformativeMessage("Vue code actions are disabled in settings.");
      return;
    }
    this.ensureStarted("add missing imports");
    if (!this.tsserverBridge) {
      nova.workspace.showInformativeMessage("TypeScript proxy is not running yet.");
      return;
    }

    const file = editor.document.path;
    if (!file) {
      return;
    }
    await this.syncEditorWithTsserver(editor);
    const diagnostics = (await this.collectTypeScriptDiagnostics(file)) as TsserverDiagnosticForFix[];
    const fixes = await this.collectImportFixes(file, diagnostics, isMissingImportFix);
    if (fixes.length === 0) {
      nova.workspace.showInformativeMessage("No missing import fixes available.");
      return;
    }
    await applyTsserverFileEdits(mergeTsserverFileEdits(fixes.flatMap((fix) => fix.changes)));
    nova.workspace.showInformativeMessage(`Applied ${fixes.length} missing import fix(es).`);
  }

  async removeUnusedImports(candidate?: unknown): Promise<void> {
    await this.applyOrganizeImports(candidate, false, "No unused imports to remove.");
  }

  async organizeImports(candidate?: unknown): Promise<void> {
    await this.applyOrganizeImports(candidate, true, "Imports already organized.");
  }

  private async applyOrganizeImports(candidate: unknown, skipDestructiveCodeActions: boolean, emptyMessage: string): Promise<void> {
    const editor = textEditorOrActive(candidate);
    if (!editor || !isVueEditor(editor)) {
      nova.workspace.showInformativeMessage("Open a .vue editor first.");
      return;
    }
    const config = readConfig();
    if (!config.codeActionsEnabled || !config.typescriptCodeActionsEnabled) {
      nova.workspace.showInformativeMessage("Vue code actions are disabled in settings.");
      return;
    }
    this.ensureStarted(skipDestructiveCodeActions ? "organize imports" : "remove unused imports");
    if (!this.tsserverBridge) {
      nova.workspace.showInformativeMessage("TypeScript proxy is not running yet.");
      return;
    }

    const file = editor.document.path;
    if (!file) {
      return;
    }
    await this.syncEditorWithTsserver(editor);
    const changes = (await this.tsserverBridge.request("organizeImports", {
      scope: {
        type: "file",
        args: { file }
      },
      skipDestructiveCodeActions,
      ...tsserverEditOptions()
    })) as TsserverFileEdit[];
    if (!Array.isArray(changes) || changes.length === 0) {
      nova.workspace.showInformativeMessage(emptyMessage);
      return;
    }
    await applyTsserverFileEdits(changes);
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

  private async collectImportFixes(
    file: string,
    diagnostics: TsserverDiagnosticForFix[],
    predicate: (fix: TsserverCodeFix) => boolean
  ): Promise<TsserverCodeFix[]> {
    if (!this.tsserverBridge) {
      return [];
    }
    const fixes: TsserverCodeFix[] = [];
    const seen = new Set<string>();
    for (const diagnostic of diagnostics) {
      if (diagnostic.code === undefined || !diagnostic.start || !diagnostic.end) {
        continue;
      }
      const diagnosticFixes = (await this.tsserverBridge.request("getCodeFixes", {
        file,
        startLine: diagnostic.start.line,
        startOffset: diagnostic.start.offset,
        endLine: diagnostic.end.line,
        endOffset: diagnostic.end.offset,
        errorCodes: [diagnostic.code],
        ...tsserverEditOptions()
      })) as TsserverCodeFix[];
      if (!Array.isArray(diagnosticFixes)) {
        continue;
      }
      for (const fix of diagnosticFixes) {
        if (!predicate(fix) || !fix.changes.some((change) => change.textChanges.length > 0)) {
          continue;
        }
        const key = JSON.stringify(fix.changes);
        if (!seen.has(key)) {
          seen.add(key);
          fixes.push(fix);
        }
      }
    }
    return fixes;
  }

  private refreshOpenVueEditors(): void {
    for (const editor of nova.workspace.textEditors) {
      if (isVueEditor(editor) && !isIgnoredWorkspacePath(editor.document.path)) {
        this.ensureStarted("vue editor refresh");
      }
    }
  }

  private createClient(config: ExtensionConfig, toolchain: Toolchain): LanguageClient {
    const server = toolchain.server!;
    const tsdk = toolchain.tsdk!;
    const proxyScript = nova.path.join(nova.extension.path, "Support", "proxy", "vue-lsp-proxy.js");
    const tsserverPath = nova.path.join(tsdk.path, "tsserver.js");
    const pluginProbeLocation = nodeModulesRoot(server.path);
    const cwd = projectRootFromTsdk(tsdk.path) || nova.workspace.path || nova.extension.path;
    const maxOldSpaceSize = this.effectiveMaxOldSpaceSize(config);
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
        config.lspLogs ? "true" : "false"
      ],
      env: {
        NODE_OPTIONS: `--max-old-space-size=${maxOldSpaceSize}`
      },
      type: "stdio"
    };

    const syntaxes: Array<string | { syntax: string; languageId: string }> = [
      { syntax: "vue", languageId: "vue" }
    ];

    const clientOptions = {
      syntaxes,
      initializationOptions: config.initializationOptions,
      debug: config.lspLogs
    };

    debug(config, `client syntaxes: ${formatClientSyntaxes(syntaxes)}`);
    debug(config, `initialization options keys: ${Object.keys(config.initializationOptions).join(", ") || "none"}`);
    debug(config, `lsp transport: stdio`);
    debug(config, `lsp command: ${serverOptions.path} ${serverOptions.args.join(" ")}`);
    debug(config, `lsp proxy cwd: ${cwd}`);
    debug(config, `node memory limit: ${maxOldSpaceSize} MB${this.temporaryMaxOldSpaceSize ? " (temporary retry)" : ""}`);
    debug(config, `lsp logs: ${config.lspLogs ? "on" : "off"}`);

    return new LanguageClient("vue", "Vue Language Server", serverOptions, clientOptions);
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
    const suggestedLimit = Math.min(Math.max(currentLimit * 2, currentLimit + 1024), 8192);
    const message =
      `Vue language server ran out of memory. Current Node Memory Limit is ${currentLimit} MB. ` +
      `Increase Runtime & Paths > Node Memory Limit${suggestedLimit > currentLimit ? ` to ${suggestedLimit} MB or higher` : ""}.`;

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

function isOutOfMemoryError(message: string): boolean {
  return /out of memory|heap out of memory|allocation failed|heap limit|oom=yes/i.test(message);
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

function validateNodePath(config: ExtensionConfig): string | null {
  if (!config.nodePath) {
    return null;
  }
  try {
    if (nova.fs.access(config.nodePath, nova.fs.R_OK) || nova.fs.access(config.nodePath, nova.fs.X_OK)) {
      return null;
    }
  } catch {
    // Fall through to the user-facing message below.
  }
  return [
    `Custom Node executable is not readable or executable: ${config.nodePath}`,
    "Choose a valid Node.js executable or clear the Node Executable setting to use /usr/bin/env node."
  ].join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

async function inputPalette(prompt: string, value: string): Promise<string | null> {
  return new Promise((resolve) => {
    nova.workspace.showInputPalette(prompt, { placeholder: value, value }, resolve);
  });
}

async function choicePalette(choices: string[], placeholder: string): Promise<number | null> {
  return new Promise((resolve) => {
    nova.workspace.showChoicePalette(choices, { placeholder }, (_choice, index) => {
      resolve(typeof index === "number" && index >= 0 && index < choices.length ? index : null);
    });
  });
}

function matchingDiagnosticCodes(
  diagnostics: TsserverDiagnosticForFix[],
  start: LspPosition,
  end: LspPosition
): Array<number | string> {
  const codes: Array<number | string> = [];
  for (const diagnostic of diagnostics) {
    if (diagnostic.code === undefined || !diagnostic.start || !diagnostic.end) {
      continue;
    }
    const diagnosticStart = tsPositionToLsp(diagnostic.start);
    const diagnosticEnd = tsPositionToLsp(diagnostic.end);
    if (rangesOverlap(diagnosticStart, diagnosticEnd, start, end) && !codes.includes(diagnostic.code)) {
      codes.push(diagnostic.code);
    }
  }
  return codes;
}

function isMissingImportFix(fix: TsserverCodeFix): boolean {
  const text = `${fix.fixName || ""} ${fix.fixId || ""} ${fix.description || ""}`.toLowerCase();
  return (
    text.includes("add import") ||
    text.includes("add missing import") ||
    text.includes("import from") ||
    text.includes("fix missing import")
  );
}

function mergeTsserverFileEdits(changes: TsserverFileEdit[]): TsserverFileEdit[] {
  const byFile = new Map<string, TsserverFileEdit>();
  for (const change of changes) {
    const existing = byFile.get(change.fileName);
    if (existing) {
      existing.textChanges.push(...change.textChanges);
    } else {
      byFile.set(change.fileName, {
        fileName: change.fileName,
        textChanges: [...change.textChanges]
      });
    }
  }
  return [...byFile.values()];
}

function textEditorOrActive(candidate: unknown): TextEditor | null {
  if (candidate && typeof candidate === "object" && "document" in candidate) {
    return candidate as TextEditor;
  }
  return nova.workspace.activeTextEditor ?? null;
}
