import type { LanguageActionContext } from "./context";

import { stringifyCompact, summarizeLspResult } from "@/lsp/debug";
import { positionAt } from "@/lsp/position";
import { debug, info, warn } from "@/shared/logger";
import { relativeWorkspacePath } from "@/workspace/paths";
import { isVueEditor } from "@/workspace/vue-editor";

export async function probeLspAtCursor(context: LanguageActionContext): Promise<void> {
  const editor = nova.workspace.activeTextEditor;
  if (!editor || !isVueEditor(editor)) {
    nova.workspace.showInformativeMessage("Open a .vue editor and place the cursor on a symbol first.");
    return;
  }

  context.ensureStarted("lsp probe");
  const client = context.client();
  if (!client) {
    nova.workspace.showInformativeMessage("Vue language server is not running yet.");
    return;
  }

  const path = editor.document.path!;
  const selection = editor.selectedRange as unknown as { start: number };
  const position = positionAt(editor, selection.start);
  const textDocument = { uri: editor.document.uri };
  const cursor = `${relativeWorkspacePath(path)}:${position.line + 1}:${position.character + 1}`;
  info(`LSP probe: ${cursor}`);

  const probes: Array<{ label: string; method: string; params: Record<string, unknown> }> = [
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
      info(`LSP probe ${probe.label}: ${summarizeLspResult(result)}, ${Date.now() - startedAt}ms`);
      debug(context.debugConfig(), `LSP probe ${probe.label} raw: ${stringifyCompact(result)}`);
    } catch (probeError) {
      warn(`LSP probe ${probe.label} failed: ${String(probeError)}`);
    }
  }

  nova.workspace.showInformativeMessage("Vue LSP probe finished. Check the Extension Console.");
}

export async function copyLspCapabilities(context: LanguageActionContext): Promise<void> {
  context.ensureStarted("copy lsp capabilities");
  const capabilities = await context.refreshCapabilities();
  if (!capabilities) {
    nova.workspace.showInformativeMessage("Vue LSP capabilities are not available yet.");
    return;
  }
  await nova.clipboard.writeText(JSON.stringify(capabilities, null, 2));
  nova.workspace.showInformativeMessage("Vue LSP capabilities copied to clipboard.");
}
