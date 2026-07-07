"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isOutOfMemoryError = isOutOfMemoryError;
exports.suggestedMemoryLimit = suggestedMemoryLimit;
exports.memoryLimitMessage = memoryLimitMessage;
function isOutOfMemoryError(message) {
    return /out of memory|heap out of memory|allocation failed|heap limit|oom=yes/i.test(message);
}
function suggestedMemoryLimit(currentLimit) {
    return Math.min(Math.max(currentLimit * 2, currentLimit + 1024), 8192);
}
function memoryLimitMessage(currentLimit, suggestedLimit) {
    return (`Vue language server ran out of memory. Current Node Memory Limit is ${currentLimit} MB. ` +
        `Increase Runtime & Paths > Node Memory Limit${suggestedLimit > currentLimit ? ` to ${suggestedLimit} MB or higher` : ""}.`);
}
