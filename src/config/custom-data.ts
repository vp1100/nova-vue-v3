import { warn } from "@/shared/logger";
import { CUSTOM_DATA_CONFIG_KEYS } from "./keys";
import { readRawConfigValue } from "./values";

const warnedCustomDataKeys = new Set<string>();

export function readCustomDataWatchPatterns(): string[] {
  const paths = CUSTOM_DATA_CONFIG_KEYS.flatMap((key) => normalizeCustomDataPaths(key, readRawConfigValue(key)));
  return [...new Set(paths.map(normalizeWatchPattern).filter(Boolean))];
}

function normalizeCustomDataPaths(key: string, value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }
  if (value !== undefined && value !== null) {
    warnInvalidCustomDataValue(key);
  }
  return [];
}

function warnInvalidCustomDataValue(key: string): void {
  if (warnedCustomDataKeys.has(key)) {
    return;
  }
  warnedCustomDataKeys.add(key);
  warn(`invalid ${key}: expected an array of file paths, for example "${key}": ["./custom-data.json"] in .nova/Configuration.json`);
}

function normalizeWatchPattern(pattern: string): string {
  return pattern.replace(/^\.\//, "");
}
