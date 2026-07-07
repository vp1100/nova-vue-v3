import type { ExtensionConfig } from "@/config/types";
import type { ToolchainResolutionOptions, TypeScriptSdkPath } from "./types";

import { exists, isReadable, joinPath } from "@/workspace/paths";
import { toolchainRoots } from "./roots";

export function resolveTsdk(config: ExtensionConfig, errors: string[], options: ToolchainResolutionOptions): TypeScriptSdkPath | null {
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

function validTsdk(path: string): boolean {
  return isReadable(joinPath(path, "typescript.js")) && isReadable(joinPath(path, "tsserverlibrary.js"));
}

function bundledTsdk(): string {
  return joinPath(nova.extension.path, "Support", "server", "node_modules", "typescript", "lib");
}

function workspaceTsdk(root: string): string {
  return joinPath(root, "node_modules", "typescript", "lib");
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
