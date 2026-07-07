# Nova Vue

Vue language support for Nova, powered by `@vue/language-server` v3 and a local TypeScript-aware LSP proxy.

Based on the original [Vue for Nova](https://github.com/tommasongr/nova-vue) extension by [Tommaso Negri](https://github.com/tommasongr).

## Features

- `.vue` syntax registration for Nova.
- Tree-sitter highlighting for Vue single-file components.
- Template, script, and style injections inside `.vue` files.
- Pug template highlighting through the bundled Pug parser.
- Parser fallback highlighting for `style lang="less"`, `style lang="sass"`, `style lang="scss"`, and `style lang="stylus"`.
- CSS fallback for `style lang="postcss"` and `style lang="pcss"`.
- Nova color picker support for CSS colors inside Vue `<style>` blocks.
- Folds, symbols, text checking, and tag matching.
- Vue Language Server v3 completions and Vue diagnostics.
- TypeScript-powered hover, Jump to Definition, Jump to Implementation, Jump to References, rename, and code actions.
- Nuxt Jump to Definition resolves generated component declarations to their source `.vue` files.
- Commands for quick fixes, missing imports, unused imports, organize imports, extracting template markup into a new component, server status, and debug info.
- Lazy language-server startup so non-Vue Nova windows do not pay the process cost.
- Workspace-first toolchain discovery with a bundled fallback for released extension builds.

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

## How It Works

Nova starts the extension when a Vue-related workspace is opened, but the language server waits until a `.vue` editor is active. Once started, Nova connects to a local proxy process.

The proxy coordinates two services:

- Vue Language Server for Vue, HTML, CSS, SFC parsing, completions, and fallback Vue language features.
- `tsserver` with `@vue/typescript-plugin` for TypeScript intelligence inside `.vue` files.

TypeScript-backed responses are overlaid first where they are stronger, then the proxy falls back to Vue Language Server behavior. The extension is intentionally scoped to Vue files; it does not become a general JavaScript, TypeScript, JSX, TSX, or React language server for the workspace.

## Toolchain Resolution

The extension never installs or updates packages at runtime.

Resolution order:

1. Explicit user path from Nova settings.
2. Workspace dependency from `node_modules`.
3. Bundled fallback in `Vue.novaextension/Support/server/node_modules`.
4. Clear failure message in Nova when no usable toolchain is found.

Global `vue-language-server` and global TypeScript are not used automatically.

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

## User Commands

The extension contributes these Nova commands:

- `Vue: Restart Language Server`
- `Vue: Show Server Status`
- `Vue: Probe LSP at Cursor`
- `Vue: Quick Fix`
- `Vue: Add Missing Imports`
- `Vue: Remove Unused Imports`
- `Vue: Organize Imports`
- `Vue: Extract Into New Component`
- `Vue: Re-detect Toolchain`
- `Vue: Open Extension Settings`

Nova's native `Editor > Show Code Actions` and lightbulb UI remain the primary path for LSP code actions. The explicit Vue commands are kept as practical fallbacks and shortcuts.

## Development

Install repository dependencies:

```sh
npm install
```

Build the extension scripts:

```sh
npm run build
```

Run local verification:

```sh
npm run verify
```

Run the full repository check:

```sh
npm run check
```

Create a local Nova bundle:

```sh
npm run package
```

The source bundle lives in `Vue.novaextension/`. Nova resolves `"main": "main.js"` to `Vue.novaextension/Scripts/main.js`; TypeScript sources live in `src/`.

## Release

See [CHANGELOG.md](CHANGELOG.md) for release notes.

`build/` and `Vue.novaextension/Support/server/node_modules/` are intentionally ignored by git. Source control keeps only the server `package.json` and `package-lock.json`; the bundled fallback dependencies are installed only for packaging.

Before publishing:

```sh
npm ci --omit=dev --prefix Vue.novaextension/Support/server
npm run check
nova extension validate build/Vue.novaextension
```

Publish the generated bundle:

```sh
nova extension publish build/Vue.novaextension
```

`nova` is not required for repository tests, but it is the official validation and publication path.

## Credits

This project is based on the original [Vue for Nova](https://github.com/tommasongr/nova-vue) extension by [Tommaso Negri](https://github.com/tommasongr). This version focuses on Vue Language Server v3, workspace-local toolchains, bundled fallback dependencies, and TypeScript-backed Vue features for modern Vue projects in Nova.

## License

MIT
