import type { LanguageActionContext } from "./context";
import {
  type TsserverCombinedCodeActions,
  type TsserverFileEdit
} from "@/tsserver/types";

import { readConfig } from "@/config/index";
import { applyTsserverFileEdits } from "@/lsp/edits";
import { mergeTsserverFileEdits } from "@/tsserver/edits";
import { tsserverEditOptions } from "@/tsserver/types";
import { textEditorOrActive } from "@/workspace/editor-context";
import { isVueEditor } from "@/workspace/vue-editor";

export async function addMissingImports(context: LanguageActionContext, candidate?: unknown): Promise<void> {
  const editor = textEditorOrActive(candidate);
  if (!editor || !isVueEditor(editor)) {
    nova.workspace.showInformativeMessage("Open a .vue editor first.");
    return;
  }
  const config = readConfig();
  if (!config.codeActionsEnabled || !config.typescriptCodeActionsEnabled) {
    nova.workspace.showInformativeMessage("Vue code actions are disabled in settings.");
    return;
  }
  context.ensureStarted("add missing imports");
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
  const combinedFix = (await tsserverBridge.request("getCombinedCodeFix", {
    scope: {
      type: "file",
      args: { file }
    },
    fixId: "fixMissingImport",
    ...tsserverEditOptions()
  })) as TsserverCombinedCodeActions;
  const changes = Array.isArray(combinedFix?.changes)
    ? combinedFix.changes.filter((change) => change.textChanges.length > 0)
    : [];
  if (changes.length === 0) {
    nova.workspace.showInformativeMessage("No missing import fixes available.");
    return;
  }
  await applyTsserverFileEdits(mergeTsserverFileEdits(changes));
}

export async function removeUnusedImports(context: LanguageActionContext, candidate?: unknown): Promise<void> {
  await applyOrganizeImports(context, candidate, false, "No unused imports to remove.");
}

export async function organizeImports(context: LanguageActionContext, candidate?: unknown): Promise<void> {
  await applyOrganizeImports(context, candidate, true, "Imports already organized.");
}

async function applyOrganizeImports(
  context: LanguageActionContext,
  candidate: unknown,
  skipDestructiveCodeActions: boolean,
  emptyMessage: string
): Promise<void> {
  const editor = textEditorOrActive(candidate);
  if (!editor || !isVueEditor(editor)) {
    nova.workspace.showInformativeMessage("Open a .vue editor first.");
    return;
  }
  const config = readConfig();
  if (!config.codeActionsEnabled || !config.typescriptCodeActionsEnabled) {
    nova.workspace.showInformativeMessage("Vue code actions are disabled in settings.");
    return;
  }
  context.ensureStarted(skipDestructiveCodeActions ? "organize imports" : "remove unused imports");
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
  const changes = (await tsserverBridge.request("organizeImports", {
    scope: {
      type: "file",
      args: { file }
    },
    skipDestructiveCodeActions,
    ...tsserverEditOptions()
  })) as TsserverFileEdit[];
  if (!Array.isArray(changes) || changes.length === 0) {
    nova.workspace.showInformativeMessage(emptyMessage);
    return;
  }
  await applyTsserverFileEdits(changes);
}
