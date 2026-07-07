"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fullRange = fullRange;
exports.createRange = createRange;
exports.fullText = fullText;
exports.positionAtText = positionAtText;
exports.positionAt = positionAt;
exports.offsetAt = offsetAt;
exports.rangesOverlap = rangesOverlap;
exports.positionIndex = positionIndex;
exports.tsPositionToLsp = tsPositionToLsp;
exports.symbolAt = symbolAt;
function fullRange(document) {
    return createRange(0, document.length);
}
function createRange(start, end) {
    return new Range(start, end);
}
function fullText(editor) {
    return editor.getTextInRange(fullRange(editor.document));
}
function positionAtText(text, offset) {
    const safeOffset = Math.max(0, Math.min(offset, text.length));
    let line = 0;
    let character = 0;
    for (let index = 0; index < safeOffset; index += 1) {
        if (text.charCodeAt(index) === 10) {
            line += 1;
            character = 0;
        }
        else {
            character += 1;
        }
    }
    return { line, character };
}
function positionAt(editor, offset) {
    return positionAtText(fullText(editor), offset);
}
function offsetAt(text, position) {
    let line = 0;
    let character = 0;
    for (let index = 0; index < text.length; index += 1) {
        if (line === position.line && character === position.character) {
            return index;
        }
        if (text.charCodeAt(index) === 10) {
            line += 1;
            character = 0;
        }
        else {
            character += 1;
        }
    }
    return text.length;
}
function rangesOverlap(aStart, aEnd, bStart, bEnd) {
    const aStartIndex = positionIndex(aStart);
    const aEndIndex = positionIndex(aEnd);
    const bStartIndex = positionIndex(bStart);
    const bEndIndex = positionIndex(bEnd);
    const cursor = bStartIndex === bEndIndex;
    if (cursor) {
        return bStartIndex >= aStartIndex && bStartIndex <= aEndIndex;
    }
    return aStartIndex <= bEndIndex && bStartIndex <= aEndIndex;
}
function positionIndex(position) {
    return position.line * 1000000 + position.character;
}
function tsPositionToLsp(position) {
    return {
        line: Math.max(0, position.line - 1),
        character: Math.max(0, position.offset - 1)
    };
}
function symbolAt(editor, offset) {
    const text = fullText(editor);
    const safeOffset = Math.max(0, Math.min(offset, text.length));
    let start = safeOffset;
    let end = safeOffset;
    while (start > 0 && /[$_\p{ID_Continue}]/u.test(text[start - 1])) {
        start -= 1;
    }
    while (end < text.length && /[$_\p{ID_Continue}]/u.test(text[end])) {
        end += 1;
    }
    return text.slice(start, end);
}
