import type { ServerStatus } from "./types";

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
