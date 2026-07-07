import type { ExtensionConfig } from "@/config/types";
import type { Toolchain } from "@/toolchain/types";
import type { TsserverBridgeStatus } from "@/tsserver/types";

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
