"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isVueEditor = isVueEditor;

function isVueEditor(editor) {
    return editor.document.syntax === "vue" && typeof editor.document.path === "string" && editor.document.path.endsWith(".vue");
}
