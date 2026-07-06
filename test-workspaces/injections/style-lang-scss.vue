<template>
  <section class="scss-card">
    <h1>{{ title }}</h1>
    <button class="scss-card__button" type="button">Save</button>
  </section>
</template>

<script setup lang="ts">
const title = "SCSS fixture";
</script>

<style lang="scss" scoped>
$brand: #0f766e;
$gap: 0.75rem;

@mixin button-reset {
  appearance: none;
  border: 0;
}

.scss-card {
  color: $brand;
  padding: $gap;

  @media (max-width: calc(64rem - 1px)) {
    padding: calc($gap / 2);
  }

  &__button {
    @include button-reset;
    border: 1px solid rgba($brand, 0.35);
    padding: 0.5rem $gap;

    &:hover {
      color: darken($brand, 10%);
    }
  }
}
</style>
