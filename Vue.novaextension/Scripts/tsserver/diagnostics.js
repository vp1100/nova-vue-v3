"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchingDiagnosticCodes = matchingDiagnosticCodes;
const position_1 = require("../lsp/position");
function matchingDiagnosticCodes(diagnostics, start, end) {
    const codes = [];
    for (const diagnostic of diagnostics) {
        if (diagnostic.code === undefined || !diagnostic.start || !diagnostic.end) {
            continue;
        }
        const diagnosticStart = (0, position_1.tsPositionToLsp)(diagnostic.start);
        const diagnosticEnd = (0, position_1.tsPositionToLsp)(diagnostic.end);
        if ((0, position_1.rangesOverlap)(diagnosticStart, diagnosticEnd, start, end) && !codes.includes(diagnostic.code)) {
            codes.push(diagnostic.code);
        }
    }
    return codes;
}
