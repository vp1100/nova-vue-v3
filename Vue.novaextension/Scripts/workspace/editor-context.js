"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.textEditorOrActive = textEditorOrActive;
function textEditorOrActive(candidate) {
    if (candidate && typeof candidate === "object" && "document" in candidate) {
        return candidate;
    }
    return nova.workspace.activeTextEditor ?? null;
}
