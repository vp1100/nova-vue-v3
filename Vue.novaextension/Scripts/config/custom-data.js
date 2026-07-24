"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readCustomDataWatchPatterns = readCustomDataWatchPatterns;
const logger_1 = require("../shared/logger");
const keys_1 = require("./keys");
const values_1 = require("./values");
const warnedCustomDataKeys = new Set();
function readCustomDataWatchPatterns() {
    const paths = keys_1.CUSTOM_DATA_CONFIG_KEYS.flatMap((key) => normalizeCustomDataPaths(key, (0, values_1.readRawConfigValue)(key)));
    return [...new Set(paths.map(normalizeWatchPattern).filter(Boolean))];
}
function normalizeCustomDataPaths(key, value) {
    if (Array.isArray(value)) {
        return value.filter((item) => typeof item === "string" && item.trim().length > 0);
    }
    if (value !== undefined && value !== null) {
        warnInvalidCustomDataValue(key);
    }
    return [];
}
function warnInvalidCustomDataValue(key) {
    if (warnedCustomDataKeys.has(key)) {
        return;
    }
    warnedCustomDataKeys.add(key);
    (0, logger_1.warn)(`invalid ${key}: expected an array of file paths, for example "${key}": ["./custom-data.json"] in .nova/Configuration.json`);
}
function normalizeWatchPattern(pattern) {
    return pattern.replace(/^\.\//, "");
}
