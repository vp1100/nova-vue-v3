# Changelog

## 0.1.1

- Fixed diagnostics handling for Vue files.
- Merged Vue and TypeScript diagnostics so one source no longer clears the other.
- Added Vue diagnostics pull support through Volar workspace diagnostics.
- Added diagnostics trigger settings for open, change, and save.
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
