import { COMMANDS } from "./constants";
import { resetGlobalConfiguration, resetWorkspaceConfiguration } from "./config";
import { VueLanguageService } from "./language-client";
import { formatStatus } from "./status";

export function registerCommands(service: VueLanguageService): Disposable[] {
  return [
    nova.commands.register(COMMANDS.restart, () => service.restart("command")),
    nova.commands.register(COMMANDS.status, () => {
      nova.workspace.showInformativeMessage(formatStatus(service.status));
    }),
    nova.commands.register(COMMANDS.debugInfo, async () => {
      const text = formatStatus(service.status);
      await nova.clipboard.writeText(text);
      nova.workspace.showInformativeMessage("Vue debug info copied to clipboard.");
    }),
    nova.commands.register(COMMANDS.lspCapabilities, () => service.copyLspCapabilities()),
    nova.commands.register(COMMANDS.probe, () => service.probeLspAtCursor()),
    nova.commands.register(COMMANDS.renameSymbol, (editor?: unknown) => service.renameSymbol(editor)),
    nova.commands.register(COMMANDS.quickFix, (editor?: unknown) => service.quickFix(editor)),
    nova.commands.register(COMMANDS.addMissingImports, (editor?: unknown) => service.addMissingImports(editor)),
    nova.commands.register(COMMANDS.removeUnusedImports, (editor?: unknown) => service.removeUnusedImports(editor)),
    nova.commands.register(COMMANDS.organizeImports, (editor?: unknown) => service.organizeImports(editor)),
    nova.commands.register(COMMANDS.redetect, () => service.redetect()),
    nova.commands.register(COMMANDS.openSettings, () => nova.workspace.openConfig(nova.extension.identifier)),
    nova.commands.register(COMMANDS.resetGlobalSettings, () => {
      resetGlobalConfiguration();
      service.scheduleRestart("global settings reset");
      nova.workspace.showInformativeMessage("Vue global settings reset to defaults.");
    }),
    nova.commands.register(COMMANDS.resetWorkspaceSettings, () => {
      resetWorkspaceConfiguration();
      service.scheduleRestart("project settings reset");
      nova.workspace.showInformativeMessage("Vue project overrides reset to defaults.");
    })
  ];
}
