export function isVueEditor(editor: TextEditor): boolean {
  return editor.document.syntax === "vue" && typeof editor.document.path === "string" && editor.document.path.endsWith(".vue");
}
