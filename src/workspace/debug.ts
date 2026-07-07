import type { ExtensionConfig } from "@/config/types";

import { readConfig } from "@/config/index";
import { debug } from "@/shared/logger";
import { basename, containsPath, exists, isIgnoredWorkspacePath, joinPath, nearestProjectRoot, workspaceContains } from "./paths";

type ConfigProvider = () => ExtensionConfig | null;

function workspacePath(): string | null {
  return nova.workspace.path ?? null;
}

function projectRootProbePath(workspaceRoot: string): string | null {
  const activePath = nova.workspace.activeTextEditor?.document.path;
  if (activePath && containsPath(workspaceRoot, activePath) && !isIgnoredWorkspacePath(activePath)) {
    return activePath;
  }

  const vueDocument = nova.workspace.textDocuments.find(
    (document) =>
      document.syntax === "vue" &&
      typeof document.path === "string" &&
      containsPath(workspaceRoot, document.path) &&
      !isIgnoredWorkspacePath(document.path)
  );
  return vueDocument?.path ?? null;
}

function documentLabel(document: TextDocument): string {
  return document.path || document.uri || "untitled";
}

export function logWorkspaceDebug(config: ExtensionConfig | null, reason: string): void {
  if (!config?.debug) {
    return;
  }

  const root = workspacePath();
  if (!root) {
    debug(config, `workspace (${reason}): none`);
    return;
  }

  const signals = [
    `package.json=${exists(joinPath(root, "package.json")) ? "yes" : "no"}`,
    `tsconfig=${exists(joinPath(root, "tsconfig.json")) ? "yes" : "no"}`,
    `jsconfig=${exists(joinPath(root, "jsconfig.json")) ? "yes" : "no"}`,
    `typescript=${exists(joinPath(root, "node_modules", "typescript", "package.json")) ? "yes" : "no"}`,
    `vue=${exists(joinPath(root, "node_modules", "vue", "package.json")) ? "yes" : "no"}`
  ];

  debug(config, `workspace (${reason}): ${root}`);
  debug(config, `project signals: ${signals.join(", ")}`);

  const probePath = projectRootProbePath(root);
  if (probePath) {
    const projectRoot = nearestProjectRoot(probePath, root);
    if (projectRoot) {
      const projectSignals = [
        `package.json=${exists(joinPath(projectRoot, "package.json")) ? "yes" : "no"}`,
        `tsconfig=${exists(joinPath(projectRoot, "tsconfig.json")) ? "yes" : "no"}`,
        `jsconfig=${exists(joinPath(projectRoot, "jsconfig.json")) ? "yes" : "no"}`,
        `typescript=${exists(joinPath(projectRoot, "node_modules", "typescript", "package.json")) ? "yes" : "no"}`,
        `vue=${exists(joinPath(projectRoot, "node_modules", "vue", "package.json")) ? "yes" : "no"}`
      ];
      debug(config, `project root probe: ${probePath}`);
      debug(config, `active project root: ${projectRoot}`);
      debug(config, `active project signals: ${projectSignals.join(", ")}`);
    } else {
      debug(config, "active project root: not found");
    }
  }
}

export function logActiveEditorDebug(config: ExtensionConfig | null, reason: string): void {
  const editor = nova.workspace.activeTextEditor;
  if (!editor) {
    debug(config, `active editor (${reason}): none`);
    return;
  }
  logEditorDebug(config, editor, `active editor (${reason})`);
}

export function logEditorDebug(config: ExtensionConfig | null, editor: TextEditor, reason: string): void {
  if (!config?.debug) {
    return;
  }

  const document = editor.document;
  const path = documentLabel(document);
  const syntax = document.syntax || "none";
  const flags = [
    `syntax=${syntax}`,
    `inside-workspace=${workspaceContains(document.path)}`,
    `dirty=${document.isDirty ? "yes" : "no"}`,
    `remote=${document.isRemote ? "yes" : "no"}`,
    `untitled=${document.isUntitled ? "yes" : "no"}`,
    `length=${document.length}`
  ];

  debug(config, `${reason}: ${path} (${flags.join(", ")})`);
}

export function registerWorkspaceDebugLogging(configProvider: ConfigProvider): Disposable[] {
  const getConfig = () => configProvider() ?? readConfig();
  const disposables: Disposable[] = [];

  disposables.push(
    nova.workspace.onDidOpenTextDocument((document) => {
      const config = getConfig();
      if (!config.debug) {
        return;
      }
      debug(
        config,
        `document opened: ${document.path || document.uri || "untitled"} (syntax=${document.syntax || "none"}, inside-workspace=${workspaceContains(document.path)})`
      );
    })
  );

  disposables.push(
    nova.workspace.onDidAddTextEditor((editor) => {
      const config = getConfig();
      logEditorDebug(config, editor, `editor added: ${basename(documentLabel(editor.document))}`);

      disposables.push(
        editor.document.onDidChangeSyntax((document, syntax) => {
          const latestConfig = getConfig();
          debug(
            latestConfig,
            `document syntax changed: ${document.path || document.uri || "untitled"} -> ${syntax || "none"}`
          );
        })
      );

      disposables.push(
        editor.onDidSave((savedEditor) => {
          logEditorDebug(getConfig(), savedEditor, "editor saved");
        })
      );
    })
  );

  return [
    {
      dispose() {
        for (const disposable of disposables) {
          disposable.dispose();
        }
      }
    }
  ];
}
