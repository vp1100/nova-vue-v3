"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLanguageActions = createLanguageActions;
const extract_component_1 = require("./extract-component");
const imports_1 = require("./imports");
const lsp_probe_1 = require("./lsp-probe");
const quick_fix_1 = require("./quick-fix");
const rename_1 = require("./rename");
function createLanguageActions(context) {
    return {
        probeLspAtCursor: () => (0, lsp_probe_1.probeLspAtCursor)(context),
        renameSymbol: (candidate) => (0, rename_1.renameSymbol)(context, candidate),
        quickFix: (candidate) => (0, quick_fix_1.quickFix)(context, candidate),
        extractIntoNewComponent: (candidate) => (0, extract_component_1.extractIntoNewComponent)(context, candidate),
        addMissingImports: (candidate) => (0, imports_1.addMissingImports)(context, candidate),
        removeUnusedImports: (candidate) => (0, imports_1.removeUnusedImports)(context, candidate),
        organizeImports: (candidate) => (0, imports_1.organizeImports)(context, candidate)
    };
}
