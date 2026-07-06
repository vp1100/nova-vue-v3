# Vue Injection Fixtures

Manual fixtures for Nova Syntax Inspector checks.

Open each `.vue` file in Nova with this extension activated, then use `Editor > Syntax Inspector`.

Expected checks:

1. `style-lang-less.vue`
   - The `<style lang="less">` block should inject as `css`.
   - This is an intentional fallback so Nova uses an available parser instead of trying to load a missing Less parser.
   - Check that selectors, properties, nested blocks, `@media`, and plain CSS-compatible parts highlight.

2. `style-lang-sass.vue`
   - The `<style lang="sass">` block should inject as `stylus`.
   - This is an intentional fallback because the bundled Stylus tokenizer can highlight indented stylesheet syntax.
   - Check indented selectors, nested blocks, variables, mixins, and comments.

3. `style-lang-scss.vue`
   - The `<style lang="scss">` block should inject as `css`.
   - This is an intentional fallback so Nova uses an available parser.
   - Check selectors, properties, nested blocks, `@media`, and plain CSS-compatible parts highlight.

4. `style-lang-postcss.vue`
   - The `<style lang="postcss">` block should inject as `css`.
   - This is an intentional fallback because PostCSS is usually CSS-compatible and Nova may not have a separate PostCSS syntax.

5. `style-lang-stylus.vue`
   - The `<style lang="stylus">` block should inject as `stylus`.
   - Stylus is backed by a bundled minimal Tree-sitter tokenizer for selectors, identifiers, colors, numbers, strings, operators, and comments.
   - This is highlighting support, not a full Stylus parser.

6. `template-lang-pug.vue`
   - The `<template lang="pug">` block should inject as `pug`.
   - Pug is backed by the bundled `libtree-sitter-pug.dylib` parser and `Queries/pug/highlights.scm`.
