import type { LanguageActionContext } from "./context";
import { extractIntoNewComponent } from "./extract-component";
import { addMissingImports, organizeImports, removeUnusedImports } from "./imports";
import { copyLspCapabilities, probeLspAtCursor } from "./lsp-probe";
import { quickFix } from "./quick-fix";
import { renameSymbol } from "./rename";

export interface LanguageActions {
  copyLspCapabilities(): Promise<void>;
  probeLspAtCursor(): Promise<void>;
  renameSymbol(candidate?: unknown): Promise<void>;
  quickFix(candidate?: unknown): Promise<void>;
  extractIntoNewComponent(candidate?: unknown): Promise<void>;
  addMissingImports(candidate?: unknown): Promise<void>;
  removeUnusedImports(candidate?: unknown): Promise<void>;
  organizeImports(candidate?: unknown): Promise<void>;
}

export function createLanguageActions(context: LanguageActionContext): LanguageActions {
  return {
    copyLspCapabilities: () => copyLspCapabilities(context),
    probeLspAtCursor: () => probeLspAtCursor(context),
    renameSymbol: (candidate) => renameSymbol(context, candidate),
    quickFix: (candidate) => quickFix(context, candidate),
    extractIntoNewComponent: (candidate) => extractIntoNewComponent(context, candidate),
    addMissingImports: (candidate) => addMissingImports(context, candidate),
    removeUnusedImports: (candidate) => removeUnusedImports(context, candidate),
    organizeImports: (candidate) => organizeImports(context, candidate)
  };
}
