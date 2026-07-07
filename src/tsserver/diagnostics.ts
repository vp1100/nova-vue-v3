import type { TsserverDiagnosticForFix } from "./types";
import type { LspPosition } from "@/lsp/types";

import { rangesOverlap, tsPositionToLsp } from "@/lsp/position";

export function matchingDiagnosticCodes(
  diagnostics: TsserverDiagnosticForFix[],
  start: LspPosition,
  end: LspPosition
): Array<number | string> {
  const codes: Array<number | string> = [];
  for (const diagnostic of diagnostics) {
    if (diagnostic.code === undefined || !diagnostic.start || !diagnostic.end) {
      continue;
    }
    const diagnosticStart = tsPositionToLsp(diagnostic.start);
    const diagnosticEnd = tsPositionToLsp(diagnostic.end);
    if (rangesOverlap(diagnosticStart, diagnosticEnd, start, end) && !codes.includes(diagnostic.code)) {
      codes.push(diagnostic.code);
    }
  }
  return codes;
}
