import type { LanguageActionContext } from "./context";
import {
  type TsserverCodeFix,
  type TsserverDiagnosticForFix
} from "@/tsserver/types";

import { choicePalette } from "@/commands/palettes";
import { readConfig } from "@/config/index";
import { applyTsserverFileEdits } from "@/lsp/edits";
import { positionAt } from "@/lsp/position";
import { matchingDiagnosticCodes } from "@/tsserver/diagnostics";
import { tsserverEditOptions } from "@/tsserver/types";
import { textEditorOrActive } from "@/workspace/editor-context";
import { isVueEditor } from "@/workspace/vue-editor";

export async function quickFix(context: LanguageActionContext, candidate?: unknown): Promise<void> {
  const editor = textEditorOrActive(candidate);
  if (!editor || !isVueEditor(editor)) {
    nova.workspace.showInformativeMessage("Open a .vue editor and place the cursor on a Vue TypeScript issue first.");
    return;
  }
  const config = readConfig();
  if (!config.codeActionsEnabled || !config.typescriptCodeActionsEnabled) {
    nova.workspace.showInformativeMessage("Vue code actions are disabled in settings.");
    return;
  }
  context.ensureStarted("quick fix");
  const tsserverBridge = context.tsserverBridge();
  if (!tsserverBridge) {
    nova.workspace.showInformativeMessage("TypeScript proxy is not running yet.");
    return;
  }

  const file = editor.document.path;
  if (!file) {
    return;
  }
  await context.syncEditorWithTsserver(editor);
  const range = editor.selectedRange as unknown as { start: number; end: number };
  const start = positionAt(editor, range.start);
  const end = positionAt(editor, range.end || range.start);
  const diagnostics = (await context.collectTypeScriptDiagnostics(file)) as TsserverDiagnosticForFix[];
  const errorCodes = matchingDiagnosticCodes(diagnostics, start, end);
  if (errorCodes.length === 0) {
    nova.workspace.showInformativeMessage("No TypeScript quick fixes at the cursor.");
    return;
  }

  const fixes = (await tsserverBridge.request("getCodeFixes", {
    file,
    startLine: start.line + 1,
    startOffset: start.character + 1,
    endLine: end.line + 1,
    endOffset: end.character + 1,
    errorCodes,
    ...tsserverEditOptions()
  })) as TsserverCodeFix[];

  const applicableFixes = Array.isArray(fixes)
    ? fixes.filter((fix) => fix.changes.some((change) => change.textChanges.length > 0))
    : [];
  if (applicableFixes.length === 0) {
    nova.workspace.showInformativeMessage("No TypeScript quick fixes available.");
    return;
  }

  const choice = await choicePalette(applicableFixes.map((fix) => fix.description), "Choose a Vue quick fix");
  const selectedFix = choice === null ? null : applicableFixes[choice];
  if (!selectedFix) {
    return;
  }
  await applyTsserverFileEdits(selectedFix.changes);
}
