"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tsserverEditOptions = tsserverEditOptions;
function tsserverEditOptions() {
    return {
        formatOptions: {
            semicolons: "remove"
        },
        preferences: {
            quotePreference: "single",
            importModuleSpecifierPreference: "shortest",
            includePackageJsonAutoImports: "auto",
            providePrefixAndSuffixTextForRename: true,
            semicolons: "remove"
        }
    };
}
