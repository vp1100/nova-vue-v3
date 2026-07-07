"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addMissingImports = addMissingImports;
exports.removeUnusedImports = removeUnusedImports;
exports.organizeImports = organizeImports;
const index_1 = require("../../config/index");
const edits_1 = require("../../lsp/edits");
const edits_2 = require("../../tsserver/edits");
const types_1 = require("../../tsserver/types");
const editor_context_1 = require("../../workspace/editor-context");
const vue_editor_1 = require("../../workspace/vue-editor");
async function addMissingImports(context, candidate) {
    const editor = (0, editor_context_1.textEditorOrActive)(candidate);
    if (!editor || !(0, vue_editor_1.isVueEditor)(editor)) {
        nova.workspace.showInformativeMessage("Open a .vue editor first.");
        return;
    }
    const config = (0, index_1.readConfig)();
    if (!config.codeActionsEnabled || !config.typescriptCodeActionsEnabled) {
        nova.workspace.showInformativeMessage("Vue code actions are disabled in settings.");
        return;
    }
    context.ensureStarted("add missing imports");
    const tsserverBridge = context.tsserverBridge();
    if (!tsserverBridge) {
        nova.workspace.showInformativeMessage("TypeScript proxy is not running yet.");
        return;
    }
    const file = editor.document.path;
    if (!file) {
        return;
    }
    await context.syncEditorWithTsserver(editor);
    const combinedFix = (await tsserverBridge.request("getCombinedCodeFix", {
        scope: {
            type: "file",
            args: { file }
        },
        fixId: "fixMissingImport",
        ...(0, types_1.tsserverEditOptions)()
    }));
    const changes = Array.isArray(combinedFix?.changes)
        ? combinedFix.changes.filter((change) => change.textChanges.length > 0)
        : [];
    if (changes.length === 0) {
        nova.workspace.showInformativeMessage("No missing import fixes available.");
        return;
    }
    await (0, edits_1.applyTsserverFileEdits)((0, edits_2.mergeTsserverFileEdits)(changes));
}
async function removeUnusedImports(context, candidate) {
    await applyOrganizeImports(context, candidate, false, "No unused imports to remove.");
}
async function organizeImports(context, candidate) {
    await applyOrganizeImports(context, candidate, true, "Imports already organized.");
}
async function applyOrganizeImports(context, candidate, skipDestructiveCodeActions, emptyMessage) {
    const editor = (0, editor_context_1.textEditorOrActive)(candidate);
    if (!editor || !(0, vue_editor_1.isVueEditor)(editor)) {
        nova.workspace.showInformativeMessage("Open a .vue editor first.");
        return;
    }
    const config = (0, index_1.readConfig)();
    if (!config.codeActionsEnabled || !config.typescriptCodeActionsEnabled) {
        nova.workspace.showInformativeMessage("Vue code actions are disabled in settings.");
        return;
    }
    context.ensureStarted(skipDestructiveCodeActions ? "organize imports" : "remove unused imports");
    const tsserverBridge = context.tsserverBridge();
    if (!tsserverBridge) {
        nova.workspace.showInformativeMessage("TypeScript proxy is not running yet.");
        return;
    }
    const file = editor.document.path;
    if (!file) {
        return;
    }
    await context.syncEditorWithTsserver(editor);
    const changes = (await tsserverBridge.request("organizeImports", {
        scope: {
            type: "file",
            args: { file }
        },
        skipDestructiveCodeActions,
        ...(0, types_1.tsserverEditOptions)()
    }));
    if (!Array.isArray(changes) || changes.length === 0) {
        nova.workspace.showInformativeMessage(emptyMessage);
        return;
    }
    await (0, edits_1.applyTsserverFileEdits)(changes);
}
