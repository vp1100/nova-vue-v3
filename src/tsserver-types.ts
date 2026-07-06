import { LspPosition } from "./lsp-position";

export interface WorkspaceEdit {
  changes?: Record<string, LspTextEdit[]>;
  documentChanges?: Array<{ textDocument?: { uri: string }; edits?: LspTextEdit[] }>;
}

export interface LspTextEdit {
  range: {
    start: LspPosition;
    end: LspPosition;
  };
  newText: string;
}

export interface TsserverDiagnosticForFix {
  start?: { line: number; offset: number };
  end?: { line: number; offset: number };
  code?: number | string;
}

export interface TsserverCodeFix {
  description: string;
  fixName?: string;
  fixId?: string;
  changes: TsserverFileEdit[];
}

export interface TsserverFileEdit {
  fileName: string;
  textChanges: TsserverTextChange[];
}

export interface TsserverTextChange {
  start: { line: number; offset: number };
  end: { line: number; offset: number };
  newText: string;
}

export function tsserverEditOptions(): Record<string, unknown> {
  return {
    formatOptions: {
      semicolons: "remove"
    },
    preferences: {
      quotePreference: "single",
      importModuleSpecifierPreference: "shortest",
      includePackageJsonAutoImports: "auto",
      providePrefixAndSuffixTextForRename: true,
      semicolons: "remove"
    }
  };
}
