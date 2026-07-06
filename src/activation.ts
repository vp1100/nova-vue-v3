import { readConfig, watchConfigChanges } from "./config";
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
    ...(config.workspaceWatchPackageFilesEnabled ? packagePatterns : [])
  ];
  return patterns.map((pattern) => nova.fs.watch(pattern, callback));
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
  disposables = [
    ...registerCommands(service),
    ...watchConfigChanges(() => service?.scheduleRestart("configuration changed")),
    ...watchWorkspaceFiles(() => {
      invalidateToolchainCache();
      service?.scheduleRestart("workspace toolchain changed", 2500);
    }),
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
