import type { ExtensionConfig } from "@/config/types";
import type { Toolchain, ToolchainResolutionOptions } from "./types";

import { readCachedToolchain, toolchainCacheKey, writeCachedToolchain } from "./cache";
import { toolchainRoots } from "./roots";
import { resolveServer } from "./server-paths";
import { resolveTsdk } from "./tsdk";

export function resolveToolchain(config: ExtensionConfig, options: ToolchainResolutionOptions = {}): Toolchain {
  const cacheKey = toolchainCacheKey(config, options);
  const cached = readCachedToolchain(cacheKey);
  if (cached) {
    return cached;
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

  return writeCachedToolchain(cacheKey, {
    server,
    tsdk,
    errors,
    hints
  });
}

export function nodeLauncher(config: ExtensionConfig): string {
  return config.nodePath || "/usr/bin/env";
}
