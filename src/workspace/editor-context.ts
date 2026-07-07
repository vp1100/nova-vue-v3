export function textEditorOrActive(candidate: unknown): TextEditor | null {
  if (candidate && typeof candidate === "object" && "document" in candidate) {
    return candidate as TextEditor;
  }
  return nova.workspace.activeTextEditor ?? null;
}
