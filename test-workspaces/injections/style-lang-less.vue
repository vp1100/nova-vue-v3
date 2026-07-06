<template>
  <section class="less-card">
    <h1>{{ title }}</h1>
    <button class="less-card__button" type="button">Save</button>
  </section>
</template>

<script setup lang="ts">
const title = "Less fixture";
</script>

<style lang="less" scoped>
@brand: #2563eb;
@gap: 0.75rem;

.button-reset() {
  appearance: none;
  border: 0;
}

.less-card {
  color: @brand;
  padding: @gap;

  @media (max-width: 48rem) {
    padding: (@gap / 2);
  }

  &__button {
    .button-reset();
    border: 1px solid fade(@brand, 35%);
    padding: 0.5rem @gap;

    &:hover {
      color: darken(@brand, 10%);
    }
  }
}
</style>
