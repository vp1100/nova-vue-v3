"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inputPalette = inputPalette;
exports.choicePalette = choicePalette;
async function inputPalette(prompt, value) {
    return new Promise((resolve) => {
        nova.workspace.showInputPalette(prompt, { placeholder: value, value }, resolve);
    });
}
async function choicePalette(choices, placeholder) {
    return new Promise((resolve) => {
        nova.workspace.showChoicePalette(choices, { placeholder }, (_choice, index) => {
            resolve(typeof index === "number" && index >= 0 && index < choices.length ? index : null);
        });
    });
}
