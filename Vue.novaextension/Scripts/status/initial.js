"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInitialStatus = createInitialStatus;
function createInitialStatus() {
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
