"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mergeTsserverFileEdits = mergeTsserverFileEdits;
function mergeTsserverFileEdits(changes) {
    const byFile = new Map();
    for (const change of changes) {
        const existing = byFile.get(change.fileName);
        if (existing) {
            existing.textChanges.push(...change.textChanges);
        }
        else {
            byFile.set(change.fileName, {
                fileName: change.fileName,
                textChanges: [...change.textChanges]
            });
        }
    }
    return [...byFile.values()];
}
