import { ExtensionConfig } from "./config";
import { containsPath, exists, isExecutable, isIgnoredWorkspacePath, isReadable, joinPath, nearestProjectRootsFromFile } from "./workspace-paths";

export type ToolSource = "custom" | "workspace" | "bundled";

export interface ToolPath {
  path: string;
  source: ToolSource;
  kind: "script" | "executable";
}

export interface TypeScriptSdkPath {
  path: string;
  source: ToolSource;
}

export interface Toolchain {
  server: ToolPath | null;
  tsdk: TypeScriptSdkPath | null;
  errors: string[];
  hints: string[];
}

export interface ToolchainResolutionOptions {
  preferBundledTsdk?: boolean;
}

let cachedToolchainKey: string | null = null;
let cachedToolchain: Toolchain | null = null;

function isJavaScript(path: string): boolean {
  return path.endsWith(".js") || path.endsWith(".cjs") || path.endsWith(".mjs");
}

function validTsdk(path: string): boolean {
  return isReadable(joinPath(path, "typescript.js")) && isReadable(joinPath(path, "tsserverlibrary.js"));
}

function workspacePath(): string | null {
  return nova.workspace.path ?? null;
}

function activeDocumentPath(): string | null {
  return nova.workspace.activeTextEditor?.document.path ?? null;
}

function openVueDocumentPaths(): string[] {
  return nova.workspace.textDocuments
    .filter((document) => document.syntax === "vue" && typeof document.path === "string" && !isIgnoredWorkspacePath(document.path))
    .map((document) => document.path as string);
}

function pushUnique(paths: string[], path: string): void {
  if (!paths.includes(path)) {
    paths.push(path);
  }
}

function toolchainRoots(config: ExtensionConfig): string[] {
  const roots: string[] = [];
  const root = workspacePath();
  if (!root) {
    return roots;
  }

  if (!config.workspaceDiscoveryEnabled) {
    return [root];
  }

  const activePath = activeDocumentPath();
  if (activePath && containsPath(root, activePath) && !isIgnoredWorkspacePath(activePath)) {
    for (const candidate of nearestProjectRootsFromFile(activePath, root)) {
      pushUnique(roots, candidate);
    }
  }

  for (const documentPath of openVueDocumentPaths()) {
    if (!containsPath(root, documentPath)) {
      continue;
    }
    for (const candidate of nearestProjectRootsFromFile(documentPath, root)) {
      pushUnique(roots, candidate);
    }
  }

  pushUnique(roots, root);
  return roots;
}

function bundledServerScript(): string {
  return joinPath(nova.extension.path, "Support", "server", "node_modules", "@vue", "language-server", "bin", "vue-language-server.js");
}

function bundledServerPackage(): string {
  return joinPath(nova.extension.path, "Support", "server", "node_modules", "@vue", "language-server", "package.json");
}

function bundledTsdk(): string {
  return joinPath(nova.extension.path, "Support", "server", "node_modules", "typescript", "lib");
}

function workspaceServerCandidates(root: string): string[] {
  return [
    joinPath(root, "node_modules", "@vue", "language-server", "bin", "vue-language-server.js"),
    joinPath(root, "node_modules", ".bin", "vue-language-server")
  ];
}

function workspaceTsdk(root: string): string {
  return joinPath(root, "node_modules", "typescript", "lib");
}

function resolveServer(config: ExtensionConfig, errors: string[]): ToolPath | null {
  if (config.serverPath) {
    if (isReadable(config.serverPath) || isExecutable(config.serverPath)) {
      return {
        path: config.serverPath,
        source: "custom",
        kind: isJavaScript(config.serverPath) ? "script" : "executable"
      };
    }
    errors.push(
      [
        `Custom Vue language server path is not readable: ${config.serverPath}`,
        "Choose the @vue/language-server bin/vue-language-server.js file or clear the setting to use workspace/bundled resolution."
      ].join("\n")
    );
    return null;
  }

  for (const root of toolchainRoots(config)) {
    for (const candidate of workspaceServerCandidates(root)) {
      if (isReadable(candidate) || isExecutable(candidate)) {
        return {
          path: candidate,
          source: "workspace",
          kind: isJavaScript(candidate) ? "script" : "executable"
        };
      }
    }
  }

  const bundled = bundledServerScript();
  if (isReadable(bundled)) {
    return {
      path: bundled,
      source: "bundled",
      kind: "script"
    };
  }

  const roots = toolchainRoots(config);
  errors.push(
    [
      "Vue language server was not found.",
      roots.length > 0 ? `Searched project roots: ${roots.join(", ")}` : "No Nova workspace root is available.",
      "Expected workspace dependency: node_modules/@vue/language-server/bin/vue-language-server.js",
      `Expected bundled fallback: ${bundled}`,
      exists(bundledServerPackage())
        ? "Bundled @vue/language-server package exists, but the executable was not readable."
        : "Bundled fallback is missing. Run: npm ci --omit=dev --prefix Vue.novaextension/Support/server"
    ].join("\n")
  );
  return null;
}

function resolveBundledTsdk(): TypeScriptSdkPath | null {
  const bundled = bundledTsdk();
  if (validTsdk(bundled)) {
    return {
      path: bundled,
      source: "bundled"
    };
  }
  return null;
}

function resolveTsdk(config: ExtensionConfig, errors: string[], options: ToolchainResolutionOptions): TypeScriptSdkPath | null {
  if (config.tsdk) {
    if (validTsdk(config.tsdk)) {
      return {
        path: config.tsdk,
        source: "custom"
      };
    }
    errors.push(
      [
        `Custom TypeScript SDK is invalid: ${config.tsdk}`,
        "The TypeScript SDK setting must point to a lib directory containing typescript.js and tsserverlibrary.js."
      ].join("\n")
    );
    return null;
  }

  if (options.preferBundledTsdk) {
    const bundled = resolveBundledTsdk();
    if (bundled) {
      return bundled;
    }
    errors.push(
      [
        "Bundled TypeScript SDK fallback was requested but is not valid.",
        `Expected bundled SDK: ${bundledTsdk()}`,
        "Run: npm ci --omit=dev --prefix Vue.novaextension/Support/server"
      ].join("\n")
    );
  }

  for (const root of toolchainRoots(config)) {
    const candidate = workspaceTsdk(root);
    if (validTsdk(candidate)) {
      return {
        path: candidate,
        source: "workspace"
      };
    }
    if (exists(candidate)) {
      errors.push(
        [
          `Workspace TypeScript SDK is incomplete: ${candidate}`,
          "Expected typescript.js and tsserverlibrary.js inside the lib directory. Falling back if possible."
        ].join("\n")
      );
    }
  }

  const bundled = resolveBundledTsdk();
  if (bundled) {
    return bundled;
  }

  const roots = toolchainRoots(config);
  errors.push(
    [
      "No valid TypeScript SDK found.",
      roots.length > 0 ? `Searched project roots: ${roots.join(", ")}` : "No Nova workspace root is available.",
      "Expected workspace dependency: node_modules/typescript/lib/typescript.js and tsserverlibrary.js",
      `Expected bundled fallback: ${bundledTsdk()}`,
      "Install typescript in the workspace or run: npm ci --omit=dev --prefix Vue.novaextension/Support/server"
    ].join("\n")
  );
  return null;
}

export function resolveToolchain(config: ExtensionConfig, options: ToolchainResolutionOptions = {}): Toolchain {
  const cacheKey = toolchainCacheKey(config, options);
  if (cachedToolchain && cachedToolchainKey === cacheKey) {
    return cachedToolchain;
  }

  const errors: string[] = [];
  const hints: string[] = [];
  const server = resolveServer(config, errors);
  const tsdk = resolveTsdk(config, errors, options);

  hints.push("Global vue-language-server and global TypeScript are intentionally not used automatically.");
  const roots = toolchainRoots(config);
  if (roots.length > 0) {
    hints.push(`Toolchain search roots: ${roots.join(", ")}`);
  }

  cachedToolchainKey = cacheKey;
  cachedToolchain = {
    server,
    tsdk,
    errors,
    hints
  };
  return cachedToolchain;
}

export function invalidateToolchainCache(): void {
  cachedToolchainKey = null;
  cachedToolchain = null;
}

export function nodeLauncher(config: ExtensionConfig): string {
  return config.nodePath || "/usr/bin/env";
}

function toolchainCacheKey(config: ExtensionConfig, options: ToolchainResolutionOptions): string {
  const root = workspacePath();
  const activePath = activeDocumentPath();
  const openVuePaths = openVueDocumentPaths().sort();
  return JSON.stringify({
    root,
    activePath,
    openVuePaths,
    serverPath: config.serverPath,
    tsdk: config.tsdk,
    preferBundledTsdk: options.preferBundledTsdk === true
  });
}
