"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractIntoNewComponent = extractIntoNewComponent;
const palettes_1 = require("../../commands/palettes");
const index_1 = require("../../config/index");
const edits_1 = require("../../lsp/edits");
const ranges_1 = require("../../tsserver/ranges");
const editor_context_1 = require("../../workspace/editor-context");
const vue_editor_1 = require("../../workspace/vue-editor");
async function extractIntoNewComponent(context, candidate) {
    const editor = (0, editor_context_1.textEditorOrActive)(candidate);
    if (!editor || !(0, vue_editor_1.isVueEditor)(editor)) {
        nova.workspace.showInformativeMessage("Open a .vue editor and select template markup first.");
        return;
    }
    const config = (0, index_1.readConfig)();
    if (!config.codeActionsEnabled || !config.typescriptCodeActionsEnabled) {
        nova.workspace.showInformativeMessage("Vue code actions are disabled in settings.");
        return;
    }
    context.ensureStarted("extract into new component");
    if (!context.client()) {
        nova.workspace.showInformativeMessage("Vue language server is not running yet.");
        return;
    }
    await context.syncEditorWithTsserver(editor);
    const applied = await tryLspExtractIntoNewComponentCodeAction(context, editor, (0, ranges_1.tsserverRangeArgs)(editor));
    if (!applied) {
        nova.workspace.showInformativeMessage("No Extract Into New Component refactor available at the selection.");
    }
}
async function tryLspExtractIntoNewComponentCodeAction(context, editor, rangeArgs) {
    const client = context.client();
    if (!client) {
        return false;
    }
    try {
        const result = (await client.sendRequest("textDocument/codeAction", {
            textDocument: { uri: editor.document.uri },
            range: {
                start: { line: rangeArgs.startLine - 1, character: rangeArgs.startOffset - 1 },
                end: { line: rangeArgs.endLine - 1, character: rangeArgs.endOffset - 1 }
            },
            context: {
                diagnostics: [],
                only: ["refactor.move", "refactor"]
            }
        }));
        const actions = Array.isArray(result) ? result.filter(isExtractIntoNewComponentAction) : [];
        if (actions.length === 0) {
            return false;
        }
        const selected = actions.length === 1
            ? actions[0]
            : actions[(await (0, palettes_1.choicePalette)(actions.map((action) => action.title || action.kind || "Extract Into New Component"), "Choose a Vue component extract refactor")) ?? -1];
        if (!selected) {
            return true;
        }
        const resolved = await resolveLspCodeAction(client, selected);
        if (resolved.edit) {
            await (0, edits_1.applyWorkspaceEdit)(resolved.edit);
            return true;
        }
        if (resolved.command?.command) {
            nova.workspace.showInformativeMessage("Extract Into New Component returned a command but no edit; command execution is not wired yet.");
            return true;
        }
        nova.workspace.showInformativeMessage("Extract Into New Component returned no edit.");
        return true;
    }
    catch {
        return false;
    }
}
async function resolveLspCodeAction(client, action) {
    if (action.edit || action.command) {
        return action;
    }
    return (await client.sendRequest("codeAction/resolve", action));
}
function isExtractIntoNewComponentAction(action) {
    if (action.disabled) {
        return false;
    }
    const text = `${action.kind || ""} ${action.title || ""}`.toLowerCase();
    return text.includes("refactor.move") && (text.includes("component") || text.includes("new file"));
}
