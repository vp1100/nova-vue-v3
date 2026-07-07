import type { ExtensionConfig } from "@/config/types";
import type { ToolPath } from "./types";

import { exists, isExecutable, isReadable, joinPath } from "@/workspace/paths";
import { toolchainRoots } from "./roots";
export function resolveServer(config: ExtensionConfig, errors: string[]): ToolPath | null {
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

function isJavaScript(path: string): boolean {
  return path.endsWith(".js") || path.endsWith(".cjs") || path.endsWith(".mjs");
}

function bundledServerScript(): string {
  return joinPath(nova.extension.path, "Support", "server", "node_modules", "@vue", "language-server", "bin", "vue-language-server.js");
}

function bundledServerPackage(): string {
  return joinPath(nova.extension.path, "Support", "server", "node_modules", "@vue", "language-server", "package.json");
}

function workspaceServerCandidates(root: string): string[] {
  return [
    joinPath(root, "node_modules", "@vue", "language-server", "bin", "vue-language-server.js"),
    joinPath(root, "node_modules", ".bin", "vue-language-server")
  ];
}
