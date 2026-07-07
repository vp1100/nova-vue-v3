import type { LanguageActionContext } from "./context";
import type { TsserverRangeArgs } from "@/tsserver/ranges";
import type { LspCodeAction } from "@/tsserver/types";

import { choicePalette } from "@/commands/palettes";
import { readConfig } from "@/config/index";
import { applyWorkspaceEdit } from "@/lsp/edits";
import { tsserverRangeArgs } from "@/tsserver/ranges";
import { textEditorOrActive } from "@/workspace/editor-context";
import { isVueEditor } from "@/workspace/vue-editor";

export async function extractIntoNewComponent(context: LanguageActionContext, candidate?: unknown): Promise<void> {
  const editor = textEditorOrActive(candidate);
  if (!editor || !isVueEditor(editor)) {
    nova.workspace.showInformativeMessage("Open a .vue editor and select template markup first.");
    return;
  }
  const config = readConfig();
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
  const applied = await tryLspExtractIntoNewComponentCodeAction(context, editor, tsserverRangeArgs(editor));
  if (!applied) {
    nova.workspace.showInformativeMessage("No Extract Into New Component refactor available at the selection.");
  }
}

async function tryLspExtractIntoNewComponentCodeAction(
  context: LanguageActionContext,
  editor: TextEditor,
  rangeArgs: TsserverRangeArgs
): Promise<boolean> {
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
    })) as LspCodeAction[];
    const actions = Array.isArray(result) ? result.filter(isExtractIntoNewComponentAction) : [];
    if (actions.length === 0) {
      return false;
    }
    const selected =
      actions.length === 1
        ? actions[0]
        : actions[
            (await choicePalette(
              actions.map((action) => action.title || action.kind || "Extract Into New Component"),
              "Choose a Vue component extract refactor"
            )) ?? -1
          ];
    if (!selected) {
      return true;
    }
    const resolved = await resolveLspCodeAction(client, selected);
    if (resolved.edit) {
      await applyWorkspaceEdit(resolved.edit);
      return true;
    }
    if (resolved.command?.command) {
      nova.workspace.showInformativeMessage("Extract Into New Component returned a command but no edit; command execution is not wired yet.");
      return true;
    }
    nova.workspace.showInformativeMessage("Extract Into New Component returned no edit.");
    return true;
  } catch {
    return false;
  }
}

async function resolveLspCodeAction(client: LanguageClient, action: LspCodeAction): Promise<LspCodeAction> {
  if (action.edit || action.command) {
    return action;
  }
  return (await client.sendRequest("codeAction/resolve", action)) as LspCodeAction;
}

function isExtractIntoNewComponentAction(action: LspCodeAction): boolean {
  if (action.disabled) {
    return false;
  }
  const text = `${action.kind || ""} ${action.title || ""}`.toLowerCase();
  return text.includes("refactor.move") && (text.includes("component") || text.includes("new file"));
}
