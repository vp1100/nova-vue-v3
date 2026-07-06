<template>
  <section class="postcss-card">
    <h1>{{ title }}</h1>
    <button class="postcss-card__button" type="button">Save</button>
  </section>
</template>

<script setup lang="ts">
const title = "PostCSS fixture";
</script>

<style lang="postcss" scoped>
.postcss-card {
  color: color-mix(in srgb, #1f2937 80%, white);

  &__button {
    appearance: none;
    border: 1px solid #94a3b8;
    padding: 0.5rem 0.75rem;
  }
}
</style>
