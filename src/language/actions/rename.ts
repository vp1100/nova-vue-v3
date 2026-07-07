import type { LanguageActionContext } from "./context";
import type { WorkspaceEdit } from "@/tsserver/types";

import { inputPalette } from "@/commands/palettes";
import { applyWorkspaceEdit } from "@/lsp/edits";
import { positionAt, symbolAt } from "@/lsp/position";
import { textEditorOrActive } from "@/workspace/editor-context";
import { isVueEditor } from "@/workspace/vue-editor";

export async function renameSymbol(context: LanguageActionContext, candidate?: unknown): Promise<void> {
  const editor = textEditorOrActive(candidate);
  if (!editor || !isVueEditor(editor)) {
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
  const selectedRange = editor.selectedRange as unknown as { start: number };
  const selectedText = editor.selectedText || symbolAt(editor, selectedRange.start);
  const position = positionAt(editor, selectedRange.start);
  const newName = await inputPalette("New name for symbol", selectedText);
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
  await applyWorkspaceEdit(edit as WorkspaceEdit);
  await nova.workspace.openFile(editor.document.uri);
  editor.scrollToCursorPosition();
}
