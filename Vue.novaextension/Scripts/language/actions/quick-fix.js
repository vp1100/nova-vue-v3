"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.quickFix = quickFix;
const palettes_1 = require("../../commands/palettes");
const index_1 = require("../../config/index");
const edits_1 = require("../../lsp/edits");
const position_1 = require("../../lsp/position");
const diagnostics_1 = require("../../tsserver/diagnostics");
const types_1 = require("../../tsserver/types");
const editor_context_1 = require("../../workspace/editor-context");
const vue_editor_1 = require("../../workspace/vue-editor");
async function quickFix(context, candidate) {
    const editor = (0, editor_context_1.textEditorOrActive)(candidate);
    if (!editor || !(0, vue_editor_1.isVueEditor)(editor)) {
        nova.workspace.showInformativeMessage("Open a .vue editor and place the cursor on a Vue TypeScript issue first.");
        return;
    }
    const config = (0, index_1.readConfig)();
    if (!config.codeActionsEnabled || !config.typescriptCodeActionsEnabled) {
        nova.workspace.showInformativeMessage("Vue code actions are disabled in settings.");
        return;
    }
    context.ensureStarted("quick fix");
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
    const range = editor.selectedRange;
    const start = (0, position_1.positionAt)(editor, range.start);
    const end = (0, position_1.positionAt)(editor, range.end || range.start);
    const diagnostics = (await context.collectTypeScriptDiagnostics(file));
    const errorCodes = (0, diagnostics_1.matchingDiagnosticCodes)(diagnostics, start, end);
    if (errorCodes.length === 0) {
        nova.workspace.showInformativeMessage("No TypeScript quick fixes at the cursor.");
        return;
    }
    const fixes = (await tsserverBridge.request("getCodeFixes", {
        file,
        startLine: start.line + 1,
        startOffset: start.character + 1,
        endLine: end.line + 1,
        endOffset: end.character + 1,
        errorCodes,
        ...(0, types_1.tsserverEditOptions)()
    }));
    const applicableFixes = Array.isArray(fixes)
        ? fixes.filter((fix) => fix.changes.some((change) => change.textChanges.length > 0))
        : [];
    if (applicableFixes.length === 0) {
        nova.workspace.showInformativeMessage("No TypeScript quick fixes available.");
        return;
    }
    const choice = await (0, palettes_1.choicePalette)(applicableFixes.map((fix) => fix.description), "Choose a Vue quick fix");
    const selectedFix = choice === null ? null : applicableFixes[choice];
    if (!selectedFix) {
        return;
    }
    await (0, edits_1.applyTsserverFileEdits)(selectedFix.changes);
}
