export function readString(key: string): string | null {
  const workspaceValue = nova.workspace.config.get(key, "string");
  if (workspaceValue) {
    return workspaceValue;
  }
  return nova.config.get(key, "string");
}

export function readRecord(key: string): Record<string, unknown> | null {
  const workspaceValue = nova.workspace.config.get(key);
  if (isRecord(workspaceValue)) {
    return workspaceValue;
  }
  const globalValue = nova.config.get(key);
  return isRecord(globalValue) ? globalValue : null;
}

export function readRawConfigValue(key: string): unknown {
  const workspaceValue = nova.workspace.config.get(key);
  return workspaceValue ?? nova.config.get(key);
}

export function readNumber(key: string, fallback: number): number {
  const workspaceValue = nova.workspace.config.get(key, "number");
  const globalValue = nova.config.get(key, "number");
  const value = workspaceValue ?? globalValue ?? fallback;
  return Number.isFinite(value) ? value : fallback;
}

export function readBoolean(key: string, fallback: boolean): boolean {
  const workspaceValue = readWorkspaceBooleanOverride(key);
  const globalValue = nova.config.get(key, "boolean");
  return workspaceValue ?? globalValue ?? fallback;
}

export function readGlobalBoolean(key: string, fallback: boolean): boolean {
  return nova.config.get(key, "boolean") ?? fallback;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readWorkspaceBooleanOverride(key: string): boolean | null {
  const value = nova.workspace.config.get(key, "string");
  if (value === "enabled") {
    return true;
  }
  if (value === "disabled") {
    return false;
  }
  return null;
}
