import { CONFIG } from "@/shared/constants";
import { CUSTOM_DATA_CONFIG_KEYS, allConfigurationKeys } from "./keys";

export function watchConfigChanges(callback: () => void): Disposable[] {
  const keys = allConfigurationKeys();
  const workspaceKeys = keys.filter((key) => key !== CONFIG.debug && key !== CONFIG.lspLogs);
  return [
    nova.config.onDidChange(CONFIG.debug, callback),
    nova.config.onDidChange(CONFIG.lspLogs, callback),
    ...workspaceKeys.flatMap((key) => [
      nova.config.onDidChange(key, callback),
      nova.workspace.config.onDidChange(key, callback)
    ]),
    ...CUSTOM_DATA_CONFIG_KEYS.flatMap((key) => [
      nova.config.onDidChange(key, callback),
      nova.workspace.config.onDidChange(key, callback)
    ])
  ];
}

export function resetGlobalConfiguration(): void {
  for (const key of allConfigurationKeys()) {
    nova.config.remove(key);
  }
}

export function resetWorkspaceConfiguration(): void {
  for (const key of allConfigurationKeys()) {
    nova.workspace.config.remove(key);
  }
}
