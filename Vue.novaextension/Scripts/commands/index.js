"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerCommands = registerCommands;
const index_1 = require("../config/index");
const constants_1 = require("../shared/constants");
const index_2 = require("../status/index");
function registerCommands(service, languageActions) {
    return [
        nova.commands.register(constants_1.COMMANDS.restart, () => service.restart("command")),
        nova.commands.register(constants_1.COMMANDS.status, () => {
            nova.workspace.showInformativeMessage((0, index_2.formatStatus)(service.status));
        }),
        nova.commands.register(constants_1.COMMANDS.probe, () => languageActions.probeLspAtCursor()),
        nova.commands.register(constants_1.COMMANDS.renameSymbol, (editor) => languageActions.renameSymbol(editor)),
        nova.commands.register(constants_1.COMMANDS.quickFix, (editor) => languageActions.quickFix(editor)),
        nova.commands.register(constants_1.COMMANDS.extractIntoNewComponent, (editor) => languageActions.extractIntoNewComponent(editor)),
        nova.commands.register(constants_1.COMMANDS.addMissingImports, (editor) => languageActions.addMissingImports(editor)),
        nova.commands.register(constants_1.COMMANDS.removeUnusedImports, (editor) => languageActions.removeUnusedImports(editor)),
        nova.commands.register(constants_1.COMMANDS.organizeImports, (editor) => languageActions.organizeImports(editor)),
        nova.commands.register(constants_1.COMMANDS.redetect, () => service.redetect()),
        nova.commands.register(constants_1.COMMANDS.openSettings, () => nova.openConfig(nova.extension.identifier)),
        nova.commands.register(constants_1.COMMANDS.resetGlobalSettings, () => {
            (0, index_1.resetGlobalConfiguration)();
            service.scheduleRestart("global settings reset");
            nova.workspace.showInformativeMessage("Vue global settings reset to defaults.");
        }),
        nova.commands.register(constants_1.COMMANDS.resetWorkspaceSettings, () => {
            (0, index_1.resetWorkspaceConfiguration)();
            service.scheduleRestart("project settings reset");
            nova.workspace.showInformativeMessage("Vue project overrides reset to defaults.");
        })
    ];
}
