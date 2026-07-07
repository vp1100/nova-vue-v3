import type { LspPosition } from "./types";

export type { LspPosition } from "./types";

export function fullRange(document: TextDocument): Range {
  return createRange(0, document.length);
}

export function createRange(start: number, end: number): Range {
  return new (Range as unknown as { new (start: number, end: number): Range })(start, end);
}

export function fullText(editor: TextEditor): string {
  return editor.getTextInRange(fullRange(editor.document));
}

export function positionAtText(text: string, offset: number): LspPosition {
  const safeOffset = Math.max(0, Math.min(offset, text.length));
  let line = 0;
  let character = 0;

  for (let index = 0; index < safeOffset; index += 1) {
    if (text.charCodeAt(index) === 10) {
      line += 1;
      character = 0;
    } else {
      character += 1;
    }
  }

  return { line, character };
}

export function positionAt(editor: TextEditor, offset: number): LspPosition {
  return positionAtText(fullText(editor), offset);
}

export function offsetAt(text: string, position: LspPosition): number {
  let line = 0;
  let character = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (line === position.line && character === position.character) {
      return index;
    }
    if (text.charCodeAt(index) === 10) {
      line += 1;
      character = 0;
    } else {
      character += 1;
    }
  }
  return text.length;
}

export function rangesOverlap(aStart: LspPosition, aEnd: LspPosition, bStart: LspPosition, bEnd: LspPosition): boolean {
  const aStartIndex = positionIndex(aStart);
  const aEndIndex = positionIndex(aEnd);
  const bStartIndex = positionIndex(bStart);
  const bEndIndex = positionIndex(bEnd);
  const cursor = bStartIndex === bEndIndex;
  if (cursor) {
    return bStartIndex >= aStartIndex && bStartIndex <= aEndIndex;
  }
  return aStartIndex <= bEndIndex && bStartIndex <= aEndIndex;
}

export function positionIndex(position: LspPosition): number {
  return position.line * 1_000_000 + position.character;
}

export function tsPositionToLsp(position: { line: number; offset: number }): LspPosition {
  return {
    line: Math.max(0, position.line - 1),
    character: Math.max(0, position.offset - 1)
  };
}

export function symbolAt(editor: TextEditor, offset: number): string {
  const text = fullText(editor);
  const safeOffset = Math.max(0, Math.min(offset, text.length));
  let start = safeOffset;
  let end = safeOffset;
  while (start > 0 && /[$_\p{ID_Continue}]/u.test(text[start - 1])) {
    start -= 1;
  }
  while (end < text.length && /[$_\p{ID_Continue}]/u.test(text[end])) {
    end += 1;
  }
  return text.slice(start, end);
}
