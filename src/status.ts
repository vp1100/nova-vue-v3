import { ExtensionConfig } from "./config";
import { ToolPath, Toolchain, TypeScriptSdkPath } from "./paths";
import { TsserverBridgeStatus } from "./tsserver-bridge";
import { containsPath, exists, isIgnoredWorkspacePath, joinPath, nearestProjectRoot } from "./workspace-paths";

export interface ServerStatus {
  running: boolean;
  state: "idle" | "starting" | "running" | "failed";
  lazyStart: boolean;
  lastError: string | null;
  lastRestartReason: string | null;
  fallbackRestartUsed: boolean;
  diagnostics: "disabled" | "waiting" | "enabled";
  toolchain: Toolchain | null;
  config: ExtensionConfig | null;
  tsserverBridge: TsserverBridgeStatus | null;
  capabilities: Record<string, unknown> | null;
}

export function createInitialStatus(): ServerStatus {
  return {
    running: false,
    state: "idle",
    lazyStart: true,
    lastError: null,
    lastRestartReason: null,
    fallbackRestartUsed: false,
    diagnostics: "waiting",
    toolchain: null,
    config: null,
    tsserverBridge: null,
    capabilities: null
  };
}

interface ProjectStatus {
  lines: string[];
  projectRoot: string | null;
}

function activeVuePath(): string | null {
  const active = nova.workspace.activeTextEditor?.document;
  if (active?.syntax === "vue" && typeof active.path === "string" && !isIgnoredWorkspacePath(active.path)) {
    return active.path;
  }
  const document = nova.workspace.textDocuments.find(
    (item) => item.syntax === "vue" && typeof item.path === "string" && !isIgnoredWorkspacePath(item.path)
  );
  return document?.path ?? null;
}

function formatProjectStatus(): ProjectStatus {
  const root = nova.workspace.path ?? null;
  const vuePath = activeVuePath();
  if (!root) {
    return {
      lines: ["Workspace: none", "Vue project root: none"],
      projectRoot: null
    };
  }

  const projectRoot = vuePath && containsPath(root, vuePath) ? nearestProjectRoot(vuePath, root) ?? root : root;
  return {
    lines: [
      `Workspace: ${root}`,
      `Vue file: ${vuePath ?? "none"}`,
      `Vue project root: ${projectRoot}`,
      `Project package.json: ${exists(joinPath(projectRoot, "package.json")) ? "yes" : "no"}`,
      `Project tsconfig: ${exists(joinPath(projectRoot, "tsconfig.json")) ? "yes" : "no"}`,
      `Project jsconfig: ${exists(joinPath(projectRoot, "jsconfig.json")) ? "yes" : "no"}`,
      `Project Vue dependency: ${exists(joinPath(projectRoot, "node_modules", "vue", "package.json")) ? "yes" : "no"}`,
      `Project TypeScript dependency: ${exists(joinPath(projectRoot, "node_modules", "typescript", "package.json")) ? "yes" : "no"}`
    ],
    projectRoot
  };
}

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

function formatNovaVersion(): string {
  const api = nova as unknown as { version?: unknown; appVersion?: unknown };
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

function formatMacOSVersion(): string {
  const text = readTextFile("/System/Library/CoreServices/SystemVersion.plist");
  const version = matchPlistString(text, "ProductUserVisibleVersion") ?? matchPlistString(text, "ProductVersion");
  return version ?? "unknown";
}

function formatVueLanguageServerVersion(server: ToolPath | null, projectRoot: string | null): string {
  if (server) {
    const version = packageVersion(serverPackageJsonPath(server, projectRoot));
    return version ? `${version} (${server.source})` : `unknown (${server.source})`;
  }

  const projectVersion = projectRoot ? packageVersion(joinPath(projectRoot, "node_modules", "@vue", "language-server", "package.json")) : null;
  if (projectVersion) {
    return `${projectVersion} (workspace available)`;
  }

  const bundledVersion = packageVersion(joinPath(nova.extension.path, "Support", "server", "node_modules", "@vue", "language-server", "package.json"));
  return bundledVersion ? `${bundledVersion} (bundled available)` : "not resolved";
}

function formatTypeScriptVersion(tsdk: TypeScriptSdkPath | null, projectRoot: string | null): string {
  if (tsdk) {
    const version = packageVersion(tsdkPackageJsonPath(tsdk, projectRoot));
    return version ? `${version} (${tsdk.source})` : `unknown (${tsdk.source})`;
  }

  const projectVersion = projectRoot ? packageVersion(joinPath(projectRoot, "node_modules", "typescript", "package.json")) : null;
  if (projectVersion) {
    return `${projectVersion} (workspace available)`;
  }

  const bundledVersion = packageVersion(joinPath(nova.extension.path, "Support", "server", "node_modules", "typescript", "package.json"));
  return bundledVersion ? `${bundledVersion} (bundled available)` : "not resolved";
}

function serverPackageJsonPath(server: ToolPath, projectRoot: string | null): string | null {
  const marker = "/node_modules/@vue/language-server/";
  const index = server.path.indexOf(marker);
  if (index >= 0) {
    return `${server.path.slice(0, index + marker.length - 1)}/package.json`;
  }
  if (server.source === "workspace" && projectRoot) {
    return joinPath(projectRoot, "node_modules", "@vue", "language-server", "package.json");
  }
  if (server.source === "bundled") {
    return joinPath(nova.extension.path, "Support", "server", "node_modules", "@vue", "language-server", "package.json");
  }
  return null;
}

function tsdkPackageJsonPath(tsdk: TypeScriptSdkPath, projectRoot: string | null): string | null {
  const marker = "/node_modules/typescript/lib";
  const index = tsdk.path.indexOf(marker);
  if (index >= 0) {
    return `${tsdk.path.slice(0, index + marker.length - 4)}/package.json`;
  }
  if (tsdk.source === "workspace" && projectRoot) {
    return joinPath(projectRoot, "node_modules", "typescript", "package.json");
  }
  if (tsdk.source === "bundled") {
    return joinPath(nova.extension.path, "Support", "server", "node_modules", "typescript", "package.json");
  }
  return null;
}

function packageVersion(packageJsonPath: string | null): string | null {
  if (!packageJsonPath) {
    return null;
  }
  const text = readTextFile(packageJsonPath);
  if (!text) {
    return null;
  }
  try {
    const parsed = JSON.parse(text) as { version?: unknown };
    return typeof parsed.version === "string" && parsed.version.trim() ? parsed.version : null;
  } catch {
    return null;
  }
}

function readTextFile(path: string): string | null {
  try {
    const file = nova.fs.open(path);
    try {
      return file.read();
    } finally {
      file.close();
    }
  } catch {
    return null;
  }
}

function matchPlistString(text: string | null, key: string): string | null {
  if (!text) {
    return null;
  }
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`<key>\\s*${escaped}\\s*<\\/key>\\s*<string>\\s*([^<]+)\\s*<\\/string>`));
  return match?.[1]?.trim() || null;
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
