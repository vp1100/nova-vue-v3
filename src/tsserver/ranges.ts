import { positionAt } from "@/lsp/position";

export interface TsserverRangeArgs {
  startLine: number;
  startOffset: number;
  endLine: number;
  endOffset: number;
}

export function tsserverRangeArgs(editor: TextEditor): TsserverRangeArgs {
  const range = editor.selectedRange as unknown as { start: number; end: number };
  const start = positionAt(editor, range.start);
  const end = positionAt(editor, range.end || range.start);
  return {
    startLine: start.line + 1,
    startOffset: start.character + 1,
    endLine: end.line + 1,
    endOffset: end.character + 1
  };
}
