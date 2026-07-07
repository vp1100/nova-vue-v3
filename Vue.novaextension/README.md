# Nova Vue

Vue language support for Nova, powered by `@vue/language-server` v3.

Based on the original [Vue for Nova](https://github.com/tommasongr/nova-vue) extension by [Tommaso Negri](https://github.com/tommasongr).

## What You Get

- Syntax highlighting for `.vue` single-file components.
- Template, script, and style highlighting inside Vue files.
- Pug template highlighting.
- Less, Sass, SCSS, PostCSS, and Stylus style highlighting through parser fallbacks.
- Nova color picker support for CSS colors inside Vue `<style>` blocks.
- Document symbols, folds, tag matching, and text checking.
- Vue completions through Vue Language Server.
- Vue and TypeScript diagnostics in `.vue` files.
- TypeScript-powered hover, Jump to Definition, Jump to Implementation, Jump to References, rename, and code actions.
- Nuxt Jump to Definition resolves generated component declarations to their source `.vue` files.
- Quick commands for missing imports, unused imports, organize imports, server status, and debug info.

## Supported Vue Blocks

- `<template>` with normal Vue template syntax.
- `<template lang="pug">` with bundled Pug highlighting.
- `<script>` with JavaScript highlighting.
- `<script lang="ts">` and `<script setup lang="ts">` with TypeScript language-server support.
- `<style>` and `<style lang="css">` with CSS highlighting.
- `<style lang="less">` with CSS parser fallback highlighting.
- `<style lang="sass">` with bundled Stylus tokenizer fallback highlighting.
- `<style lang="scss">` with CSS parser fallback highlighting.
- `<style lang="postcss">` and `<style lang="pcss">` with CSS fallback highlighting.
- `<style lang="stylus">` and `<style lang="styl">` with bundled Stylus highlighting.

## How It Starts

The extension activates for Vue workspaces, but the language server starts lazily. It waits until you open or switch to a `.vue` editor, so normal Nova windows are not slowed down by unused Vue processes.

Each Nova workspace owns its own Vue language-server process. This keeps diagnostics and toolchain resolution scoped to the project you are editing.

## Toolchain

The extension does not install packages at runtime.

It resolves Vue and TypeScript tooling in this order:

1. Paths set in Nova extension settings.
2. Workspace dependencies from `node_modules`.
3. Bundled fallback dependencies included with the extension.

Global Vue Language Server and global TypeScript installs are not used automatically. This keeps behavior predictable across projects.

## Commands

Available from Nova's command palette and editor menu:

- `Vue: Restart Language Server`
- `Vue: Show Server Status`
- `Vue: Copy Debug Info`
- `Vue: Copy LSP Capabilities`
- `Vue: Probe LSP at Cursor`
- `Vue: Quick Fix`
- `Vue: Add Missing Imports`
- `Vue: Remove Unused Imports`
- `Vue: Organize Imports`
- `Vue: Re-detect Toolchain`
- `Vue: Open Extension Settings`

Nova's native `Editor > Show Code Actions` and lightbulb UI are the preferred way to apply LSP fixes. The Vue commands are available as direct shortcuts when you want a specific action.

## Settings

The extension includes settings for:

- Project discovery and config-file watching.
- Node, Vue Language Server, and TypeScript SDK paths.
- Language-server memory limit.
- Vue completions, diagnostics, and fallback behavior.
- TypeScript-backed navigation, rename, diagnostics, and code actions.
- Debug logging and raw initialization options.

Diagnostics can run when a `.vue` file is opened, changed, or saved. Those triggers are enabled by default and can be changed globally or per workspace when a project needs quieter diagnostics.

Global debug and LSP log settings intentionally stay global-only. Project settings can inherit global booleans or override them with enabled/disabled tri-state controls.

## Custom HTML And CSS Data

Custom HTML and CSS data lets Vue Language Server offer completions and hover information for project-specific tags, attributes, CSS properties, pseudo-classes, and pseudo-elements inside `.vue` files.

Use the standard custom-data formats documented by the VS Code language services:

- [HTML custom data format](https://github.com/microsoft/vscode-html-languageservice/blob/main/docs/customData.md)
- [CSS custom data format](https://github.com/microsoft/vscode-css-languageservice/blob/main/docs/customData.md)

Add the paths in Nova project settings:

`.nova/Configuration.json`

```json
{
  "html.customData": ["./custom-html-data.json"],
  "css.customData": ["./custom-css-data.json"]
}
```

Paths are resolved relative to the project root. When a configured custom-data file changes, the extension restarts Vue Language Server so it reloads the data.

## Troubleshooting

Use `Vue: Show Server Status` to check what the extension detected for the active workspace.

Use `Vue: Copy Debug Info` when reporting an issue. It includes the active Vue file, workspace root, resolved toolchain paths, and relevant settings without requiring full LSP traffic logs.

Enable `LSP Logs` only while debugging protocol-level behavior; those logs can be noisy.

## Credits

Based on the original [Vue for Nova](https://github.com/tommasongr/nova-vue) extension by [Tommaso Negri](https://github.com/tommasongr).

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release notes.
