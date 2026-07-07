import type { ExtensionConfig } from "@/config/types";
import type { Toolchain, ToolchainResolutionOptions } from "./types";

import { activeDocumentPath, openVueDocumentPaths, workspacePath } from "./roots";

let cachedToolchainKey: string | null = null;
let cachedToolchain: Toolchain | null = null;

export function readCachedToolchain(cacheKey: string): Toolchain | null {
  return cachedToolchain && cachedToolchainKey === cacheKey ? cachedToolchain : null;
}

export function writeCachedToolchain(cacheKey: string, toolchain: Toolchain): Toolchain {
  cachedToolchainKey = cacheKey;
  cachedToolchain = toolchain;
  return cachedToolchain;
}

export function invalidateToolchainCache(): void {
  cachedToolchainKey = null;
  cachedToolchain = null;
}

export function toolchainCacheKey(config: ExtensionConfig, options: ToolchainResolutionOptions): string {
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
