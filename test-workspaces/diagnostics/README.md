# Diagnostics Test Workspace

Open this folder in Nova to test language-server diagnostics without reloading the extension bundle on every save.

```sh
npm install
```

Then open the `.vue` files and check that Nova shows intentional errors.

TypeScript diagnostics fixtures:

- `script-type-error.vue`
- `template-type-error.vue`
- `missing-import.vue`
- `missing-local-import.vue` for LSP-native Code Actions / lightbulb checks
- `invalid-prop.vue`

Vue/SFC parser diagnostics fixtures:

- `duplicate-script-setup.vue`
- `template-parse-error.vue`
- `sfc-syntax-error.vue`
