"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyWorkspaceEdit = applyWorkspaceEdit;
exports.applyLspTextEdits = applyLspTextEdits;
exports.applyTsserverFileEdits = applyTsserverFileEdits;

const lsp_position_1 = require("./lsp-position");

async function applyWorkspaceEdit(edit) {
    if (edit.documentChanges) {
        for (const change of edit.documentChanges) {
            if (change.textDocument?.uri && change.edits) {
                await applyLspTextEdits(change.textDocument.uri, change.edits);
            }
        }
    }
    if (edit.changes) {
        for (const uri of Object.keys(edit.changes)) {
            await applyLspTextEdits(uri, edit.changes[uri]);
        }
    }
}
async function applyLspTextEdits(uri, edits) {
    const editor = await nova.workspace.openFile(uri);
    if (!editor) {
        return;
    }
    const text = (0, lsp_position_1.fullText)(editor);
    const sorted = [...edits].sort((left, right) => (0, lsp_position_1.offsetAt)(text, right.range.start) - (0, lsp_position_1.offsetAt)(text, left.range.start));
    await editor.edit((edit) => {
        for (const textEdit of sorted) {
            edit.replace((0, lsp_position_1.createRange)((0, lsp_position_1.offsetAt)(text, textEdit.range.start), (0, lsp_position_1.offsetAt)(text, textEdit.range.end)), textEdit.newText);
        }
    });
}
async function applyTsserverFileEdits(changes) {
    for (const change of changes) {
        const editor = await nova.workspace.openFile(change.fileName);
        if (!editor) {
            continue;
        }
        const text = (0, lsp_position_1.fullText)(editor);
        const sorted = [...change.textChanges].sort((left, right) => (0, lsp_position_1.offsetAt)(text, (0, lsp_position_1.tsPositionToLsp)(right.start)) - (0, lsp_position_1.offsetAt)(text, (0, lsp_position_1.tsPositionToLsp)(left.start)));
        await editor.edit((edit) => {
            for (const textChange of sorted) {
                edit.replace((0, lsp_position_1.createRange)((0, lsp_position_1.offsetAt)(text, (0, lsp_position_1.tsPositionToLsp)(textChange.start)), (0, lsp_position_1.offsetAt)(text, (0, lsp_position_1.tsPositionToLsp)(textChange.end))), textChange.newText);
            }
        });
    }
}
