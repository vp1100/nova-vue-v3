import { createRange, fullText, offsetAt, tsPositionToLsp } from "./lsp-position";
import { LspTextEdit, TsserverFileEdit, WorkspaceEdit } from "./tsserver-types";

export async function applyWorkspaceEdit(edit: WorkspaceEdit): Promise<void> {
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

export async function applyLspTextEdits(uri: string, edits: LspTextEdit[]): Promise<void> {
  const editor = await nova.workspace.openFile(uri);
  if (!editor) {
    return;
  }
  const text = fullText(editor);
  const sorted = [...edits].sort((left, right) => offsetAt(text, right.range.start) - offsetAt(text, left.range.start));
  await editor.edit((edit) => {
    for (const textEdit of sorted) {
      edit.replace(createRange(offsetAt(text, textEdit.range.start), offsetAt(text, textEdit.range.end)), textEdit.newText);
    }
  });
}

export async function applyTsserverFileEdits(changes: TsserverFileEdit[]): Promise<void> {
  for (const change of changes) {
    const editor = await nova.workspace.openFile(change.fileName);
    if (!editor) {
      continue;
    }
    const text = fullText(editor);
    const sorted = [...change.textChanges].sort(
      (left, right) => offsetAt(text, tsPositionToLsp(right.start)) - offsetAt(text, tsPositionToLsp(left.start))
    );
    await editor.edit((edit) => {
      for (const textChange of sorted) {
        edit.replace(
          createRange(offsetAt(text, tsPositionToLsp(textChange.start)), offsetAt(text, tsPositionToLsp(textChange.end))),
          textChange.newText
        );
      }
    });
  }
}
