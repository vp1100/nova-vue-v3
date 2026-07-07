import type { TsserverFileEdit } from "./types";

export function mergeTsserverFileEdits(changes: TsserverFileEdit[]): TsserverFileEdit[] {
  const byFile = new Map<string, TsserverFileEdit>();
  for (const change of changes) {
    const existing = byFile.get(change.fileName);
    if (existing) {
      existing.textChanges.push(...change.textChanges);
    } else {
      byFile.set(change.fileName, {
        fileName: change.fileName,
        textChanges: [...change.textChanges]
      });
    }
  }
  return [...byFile.values()];
}
