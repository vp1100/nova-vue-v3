"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renameSymbol = renameSymbol;
const palettes_1 = require("../../commands/palettes");
const edits_1 = require("../../lsp/edits");
const position_1 = require("../../lsp/position");
const editor_context_1 = require("../../workspace/editor-context");
const vue_editor_1 = require("../../workspace/vue-editor");
async function renameSymbol(context, candidate) {
    const editor = (0, editor_context_1.textEditorOrActive)(candidate);
    if (!editor || !(0, vue_editor_1.isVueEditor)(editor)) {
        nova.workspace.showInformativeMessage("Open a .vue editor and place the cursor on a symbol first.");
        return;
    }
    context.ensureStarted("rename symbol");
    const client = context.client();
    if (!client) {
        nova.workspace.showInformativeMessage("Vue language server is not running yet.");
        return;
    }
    editor.selectWordsContainingCursors();
    const selectedRange = editor.selectedRange;
    const selectedText = editor.selectedText || (0, position_1.symbolAt)(editor, selectedRange.start);
    const position = (0, position_1.positionAt)(editor, selectedRange.start);
    const newName = await (0, palettes_1.inputPalette)("New name for symbol", selectedText);
    if (!newName || newName === selectedText) {
        return;
    }
    const edit = await client.sendRequest("textDocument/rename", {
        textDocument: { uri: editor.document.uri },
        position,
        newName
    });
    if (!edit) {
        nova.workspace.showWarningMessage("Couldn't rename symbol.");
        return;
    }
    await (0, edits_1.applyWorkspaceEdit)(edit);
    await nova.workspace.openFile(editor.document.uri);
    editor.scrollToCursorPosition();
}
