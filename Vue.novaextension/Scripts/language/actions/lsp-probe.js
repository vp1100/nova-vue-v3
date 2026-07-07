"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.probeLspAtCursor = probeLspAtCursor;
exports.copyLspCapabilities = copyLspCapabilities;
const debug_1 = require("../../lsp/debug");
const position_1 = require("../../lsp/position");
const logger_1 = require("../../shared/logger");
const paths_1 = require("../../workspace/paths");
const vue_editor_1 = require("../../workspace/vue-editor");
async function probeLspAtCursor(context) {
    const editor = nova.workspace.activeTextEditor;
    if (!editor || !(0, vue_editor_1.isVueEditor)(editor)) {
        nova.workspace.showInformativeMessage("Open a .vue editor and place the cursor on a symbol first.");
        return;
    }
    context.ensureStarted("lsp probe");
    const client = context.client();
    if (!client) {
        nova.workspace.showInformativeMessage("Vue language server is not running yet.");
        return;
    }
    const path = editor.document.path;
    const selection = editor.selectedRange;
    const position = (0, position_1.positionAt)(editor, selection.start);
    const textDocument = { uri: editor.document.uri };
    const cursor = `${(0, paths_1.relativeWorkspacePath)(path)}:${position.line + 1}:${position.character + 1}`;
    (0, logger_1.info)(`LSP probe: ${cursor}`);
    const probes = [
        {
            label: "hover",
            method: "textDocument/hover",
            params: { textDocument, position }
        },
        {
            label: "definition",
            method: "textDocument/definition",
            params: { textDocument, position }
        },
        {
            label: "references",
            method: "textDocument/references",
            params: { textDocument, position, context: { includeDeclaration: true } }
        },
        {
            label: "prepareRename",
            method: "textDocument/prepareRename",
            params: { textDocument, position }
        },
        {
            label: "codeAction",
            method: "textDocument/codeAction",
            params: {
                textDocument,
                range: { start: position, end: position },
                context: { diagnostics: [] }
            }
        },
        {
            label: "signatureHelp",
            method: "textDocument/signatureHelp",
            params: {
                textDocument,
                position,
                context: {
                    triggerKind: 1
                }
            }
        }
    ];
    for (const probe of probes) {
        const startedAt = Date.now();
        try {
            const result = await client.sendRequest(probe.method, probe.params);
            (0, logger_1.info)(`LSP probe ${probe.label}: ${(0, debug_1.summarizeLspResult)(result)}, ${Date.now() - startedAt}ms`);
            (0, logger_1.debug)(context.debugConfig(), `LSP probe ${probe.label} raw: ${(0, debug_1.stringifyCompact)(result)}`);
        }
        catch (probeError) {
            (0, logger_1.warn)(`LSP probe ${probe.label} failed: ${String(probeError)}`);
        }
    }
    nova.workspace.showInformativeMessage("Vue LSP probe finished. Check the Extension Console.");
}
async function copyLspCapabilities(context) {
    context.ensureStarted("copy lsp capabilities");
    const capabilities = await context.refreshCapabilities();
    if (!capabilities) {
        nova.workspace.showInformativeMessage("Vue LSP capabilities are not available yet.");
        return;
    }
    await nova.clipboard.writeText(JSON.stringify(capabilities, null, 2));
    nova.workspace.showInformativeMessage("Vue LSP capabilities copied to clipboard.");
}
