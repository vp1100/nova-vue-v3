import { readConfig, readCustomDataWatchPatterns, watchConfigChanges } from "./config";
import { registerCommands } from "./commands";
import { VueLanguageService } from "./language-client";
import { info } from "./logger";
import { invalidateToolchainCache } from "./paths";
import { registerWorkspaceDebugLogging } from "./workspace-debug";

let disposables: Disposable[] = [];
let service: VueLanguageService | null = null;

function watchWorkspaceFiles(callback: () => void): Disposable[] {
  const config = readConfig();
  const configPatterns = [
    ".nova/Configuration.json",
    "tsconfig*.json",
    "jsconfig*.json",
    "vite.config.*",
    "nuxt.config.*",
    "vue.config.*"
  ];
  const packagePatterns = [
    "package.json",
    "node_modules/typescript/package.json",
    "node_modules/@vue/language-server/package.json"
  ];
  const patterns = [
    ...(config.workspaceWatchConfigFilesEnabled ? configPatterns : []),
    ...(config.workspaceWatchPackageFilesEnabled ? packagePatterns : []),
    ...readCustomDataWatchPatterns()
  ];
  return [...new Set(patterns)].map((pattern) => nova.fs.watch(pattern, callback));
}

function watchEditorDiagnostics(service: VueLanguageService): Disposable[] {
  const disposables: Disposable[] = [];
  for (const editor of nova.workspace.textEditors) {
    disposables.push(...service.registerEditor(editor));
  }
  disposables.push(
    nova.workspace.onDidAddTextEditor((editor) => {
      disposables.push(...service.registerEditor(editor));
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

export function activate(): void {
  info("extension activated");
  service = new VueLanguageService();
  let workspaceFileWatchers: Disposable[] = [];
  const disposeWorkspaceFileWatchers = () => {
    for (const disposable of workspaceFileWatchers) {
      disposable.dispose();
    }
    workspaceFileWatchers = [];
  };
  const refreshWorkspaceFileWatchers = () => {
    disposeWorkspaceFileWatchers();
    workspaceFileWatchers = watchWorkspaceFiles(() => {
      invalidateToolchainCache();
      service?.scheduleRestart("workspace file changed", 2500);
    });
  };
  refreshWorkspaceFileWatchers();

  disposables = [
    ...registerCommands(service),
    ...watchConfigChanges(() => {
      refreshWorkspaceFileWatchers();
      service?.scheduleRestart("configuration changed");
    }),
    { dispose: disposeWorkspaceFileWatchers },
    ...watchEditorDiagnostics(service),
    ...registerWorkspaceDebugLogging(() => service?.status.config ?? null)
  ];
}

export function deactivate(): void {
  info("extension deactivated");
  service?.stop();
  service = null;
  for (const disposable of disposables) {
    disposable.dispose();
  }
  disposables = [];
}
