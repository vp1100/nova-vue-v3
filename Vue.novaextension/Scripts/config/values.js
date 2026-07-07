"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readString = readString;
exports.readRecord = readRecord;
exports.readRawConfigValue = readRawConfigValue;
exports.readNumber = readNumber;
exports.readBoolean = readBoolean;
exports.readGlobalBoolean = readGlobalBoolean;
exports.isRecord = isRecord;
function readString(key) {
    const workspaceValue = nova.workspace.config.get(key, "string");
    if (workspaceValue) {
        return workspaceValue;
    }
    return nova.config.get(key, "string");
}
function readRecord(key) {
    const workspaceValue = nova.workspace.config.get(key);
    if (isRecord(workspaceValue)) {
        return workspaceValue;
    }
    const globalValue = nova.config.get(key);
    return isRecord(globalValue) ? globalValue : null;
}
function readRawConfigValue(key) {
    const workspaceValue = nova.workspace.config.get(key);
    return workspaceValue ?? nova.config.get(key);
}
function readNumber(key, fallback) {
    const workspaceValue = nova.workspace.config.get(key, "number");
    const globalValue = nova.config.get(key, "number");
    const value = workspaceValue ?? globalValue ?? fallback;
    return Number.isFinite(value) ? value : fallback;
}
function readBoolean(key, fallback) {
    const workspaceValue = readWorkspaceBooleanOverride(key);
    const globalValue = nova.config.get(key, "boolean");
    return workspaceValue ?? globalValue ?? fallback;
}
function readGlobalBoolean(key, fallback) {
    return nova.config.get(key, "boolean") ?? fallback;
}
function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
function readWorkspaceBooleanOverride(key) {
    const value = nova.workspace.config.get(key, "string");
    if (value === "enabled") {
        return true;
    }
    if (value === "disabled") {
        return false;
    }
    return null;
}
