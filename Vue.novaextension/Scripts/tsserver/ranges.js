"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tsserverRangeArgs = tsserverRangeArgs;
const position_1 = require("../lsp/position");
function tsserverRangeArgs(editor) {
    const range = editor.selectedRange;
    const start = (0, position_1.positionAt)(editor, range.start);
    const end = (0, position_1.positionAt)(editor, range.end || range.start);
    return {
        startLine: start.line + 1,
        startOffset: start.character + 1,
        endLine: end.line + 1,
        endOffset: end.character + 1
    };
}
