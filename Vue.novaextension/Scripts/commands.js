"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerCommands = registerCommands;

const constants_1 = require("./constants");
const config_1 = require("./config");
const status_1 = require("./status");

function registerCommands(service) {
    return [
        nova.commands.register(constants_1.COMMANDS.restart, () => service.restart("command")),
        nova.commands.register(constants_1.COMMANDS.status, () => {
            nova.workspace.showInformativeMessage((0, status_1.formatStatus)(service.status));
        }),
        nova.commands.register(constants_1.COMMANDS.debugInfo, async () => {
            const text = (0, status_1.formatStatus)(service.status);
            await nova.clipboard.writeText(text);
            nova.workspace.showInformativeMessage("Vue debug info copied to clipboard.");
        }),
        nova.commands.register(constants_1.COMMANDS.lspCapabilities, () => service.copyLspCapabilities()),
        nova.commands.register(constants_1.COMMANDS.probe, () => service.probeLspAtCursor()),
        nova.commands.register(constants_1.COMMANDS.renameSymbol, (editor) => service.renameSymbol(editor)),
        nova.commands.register(constants_1.COMMANDS.quickFix, (editor) => service.quickFix(editor)),
        nova.commands.register(constants_1.COMMANDS.extractIntoNewComponent, (editor) => service.extractIntoNewComponent(editor)),
        nova.commands.register(constants_1.COMMANDS.addMissingImports, (editor) => service.addMissingImports(editor)),
        nova.commands.register(constants_1.COMMANDS.removeUnusedImports, (editor) => service.removeUnusedImports(editor)),
        nova.commands.register(constants_1.COMMANDS.organizeImports, (editor) => service.organizeImports(editor)),
        nova.commands.register(constants_1.COMMANDS.redetect, () => service.redetect()),
        nova.commands.register(constants_1.COMMANDS.openSettings, () => nova.workspace.openConfig(nova.extension.identifier)),
        nova.commands.register(constants_1.COMMANDS.resetGlobalSettings, () => {
            (0, config_1.resetGlobalConfiguration)();
            service.scheduleRestart("global settings reset");
            nova.workspace.showInformativeMessage("Vue global settings reset to defaults.");
        }),
        nova.commands.register(constants_1.COMMANDS.resetWorkspaceSettings, () => {
            (0, config_1.resetWorkspaceConfiguration)();
            service.scheduleRestart("project settings reset");
            nova.workspace.showInformativeMessage("Vue project overrides reset to defaults.");
        })
    ];
}
