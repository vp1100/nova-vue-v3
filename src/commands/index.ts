import type { LanguageActions } from "@/language/actions/index";

import { resetGlobalConfiguration, resetWorkspaceConfiguration } from "@/config/index";
import { VueLanguageService } from "@/language/VueLanguageService";
import { COMMANDS } from "@/shared/constants";
import { formatStatus } from "@/status/index";

export function registerCommands(service: VueLanguageService, languageActions: LanguageActions): Disposable[] {
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
    nova.commands.register(COMMANDS.lspCapabilities, () => languageActions.copyLspCapabilities()),
    nova.commands.register(COMMANDS.probe, () => languageActions.probeLspAtCursor()),
    nova.commands.register(COMMANDS.renameSymbol, (editor?: unknown) => languageActions.renameSymbol(editor)),
    nova.commands.register(COMMANDS.quickFix, (editor?: unknown) => languageActions.quickFix(editor)),
    nova.commands.register(COMMANDS.extractIntoNewComponent, (editor?: unknown) => languageActions.extractIntoNewComponent(editor)),
    nova.commands.register(COMMANDS.addMissingImports, (editor?: unknown) => languageActions.addMissingImports(editor)),
    nova.commands.register(COMMANDS.removeUnusedImports, (editor?: unknown) => languageActions.removeUnusedImports(editor)),
    nova.commands.register(COMMANDS.organizeImports, (editor?: unknown) => languageActions.organizeImports(editor)),
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
