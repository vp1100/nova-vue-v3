# Vue Symbol Fixtures

Manual fixtures for Nova symbol path and tag matching checks.

Open each `.vue` file in Nova with this extension activated, then use the editor symbol path, `Editor > Syntax Inspector`, and tag matching.

Expected checks:

1. `self-closing-components.vue`
   - `<NavBar />`, `<NavItem />`, `<IconChevron />`, and `<StatusBadge />` should appear as self-closing tag symbols.
   - Moving the cursor after a self-closing component should not make the editor symbol path stay inside that component.
   - The surrounding `<main>`, `<section>`, and `<article>` pairs should still tag-match correctly.

2. `self-closing-sfc-blocks.vue`
   - Empty top-level SFC blocks should use paired tags: `<template></template>`, `<script setup lang="ts"></script>`, and `<style scoped></style>`.
   - Top-level `<template />`, `<script setup />`, and `<style />` are intentionally not used here because Nova's Vue parser treats them as unclosed SFC blocks.
   - The normal `<template>...</template>`, `<script>...</script>`, and `<style>...</style>` blocks should still appear as top-level symbols.
   - Tag matching should work for both empty paired blocks and normal blocks.

3. `nested-self-closing-tags.vue`
   - Nested self-closing tags should not become parents of following siblings.
   - The symbol path inside `<strong>` should include `section > article > p > strong`, not the preceding `<Avatar />` or `<MetricCard />`.
   - Void HTML tags such as `<img />`, `<input />`, and `<br />` should remain leaf symbols.
