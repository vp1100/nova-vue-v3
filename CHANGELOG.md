# Changelog

## 0.1.5

- Updated Nova environment, settings, color assistant, and language client integration for Nova 14.
- Added explicit TypeScript overlay capabilities for hover, definitions, implementations, references, and rename.
- Added TypeScript completions, auto-import completion edits, and signature help inside Vue script blocks.
- Kept Vue template completions by merging them with TypeScript completion results and using Nova-compatible dynamic insertion for opening tags.
- Added identifier completion triggers so automatic suggestions refresh while typing JavaScript and Vue component names.
- Preserved TypeScript completion replacement ranges and commit characters so Nova can display and insert completion items correctly.
- Fixed TypeScript bridge status reporting and cleaned up stopped clients so the language server can restart reliably.
- Removed the unsupported custom handler for the core `workspace/configuration` LSP request.

## 0.1.4

- Removed clipboard permissions by dropping the debug-info and LSP-capabilities copy commands.

## 0.1.3

- Added Nova color picker support for CSS colors inside Vue `<style>` blocks.
- Supported hex, RGB/RGBA, HSL/HSLA, percentage RGB, modern space/slash syntax, and HSL hue units.
- Added TypeScript-backed `textDocument/implementation` support so Nova can enable native Jump to Implementations for `.vue` files.
- Redirected Nuxt generated component definitions from `.nuxt/**/components.d.ts` entries to their real `.vue` component files.
- Added `Vue: Extract Into New Component`.
- Changed `Vue: Add Missing Imports` to use TypeScript's combined `fixMissingImport` code fix, avoiding duplicate imports from multiple quick-fix candidates.
- Improved `.vue` diagnostics debounce during continuous editing.
- Reorganized TypeScript sources into domain modules with clean aliased builds.

## 0.1.2

- Added top-level Nova project support for `html.customData` and `css.customData`.
- Supported the standard custom-data array format used by the HTML and CSS language services.
- Restarted the Vue Language Server when configured custom-data files change.
- Added Vue server status details for Nova, macOS, TypeScript, and Vue Language Server versions.
- Added ESLint and TypeScript linting to the release check.

## 0.1.1

- Fixed `.vue` diagnostics so Vue and TypeScript results are merged instead of one source clearing the other.
- Added Vue diagnostics pull support through Vue Language Server workspace diagnostics.
- Added settings for running diagnostics on file open, change, and save.
- Added workspace overrides for diagnostics triggers.
- Added smoke test coverage for Vue parse diagnostics.

## 0.1.0

- Initial Nova Vue extension release.
- Tree-sitter Vue syntax with template, script, style, Pug, Stylus, and stylesheet fallback injections.
- TypeScript source layout with CommonJS runtime output.
- Toolchain discovery for custom, workspace, and bundled server/TypeScript SDK.
- Lazy Vue Language Server v3 startup through a local LSP proxy.
- TypeScript-backed hover, definition, references, rename, diagnostics, and code actions in `.vue` files.
- Nova commands for restart, status, debug info, LSP capability probing, quick fixes, import actions, settings, and toolchain re-detection.
