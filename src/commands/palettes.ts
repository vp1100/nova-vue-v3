export async function inputPalette(prompt: string, value: string): Promise<string | null> {
  return new Promise((resolve) => {
    nova.workspace.showInputPalette(prompt, { placeholder: value, value }, resolve);
  });
}

export async function choicePalette(choices: string[], placeholder: string): Promise<number | null> {
  return new Promise((resolve) => {
    nova.workspace.showChoicePalette(choices, { placeholder }, (_choice, index) => {
      resolve(typeof index === "number" && index >= 0 && index < choices.length ? index : null);
    });
  });
}
