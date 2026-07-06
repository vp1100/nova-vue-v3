<template>
  <section class="sass-card">
    <h1>{{ title }}</h1>
    <button class="sass-card__button" type="button">Save</button>
  </section>
</template>

<script setup lang="ts">
const title = "Sass fixture";
</script>

<style lang="sass" scoped>
$brand: #7c3aed
$gap: .75rem

=button-reset
  appearance: none
  border: 0

.sass-card
  color: $brand
  padding: $gap

  @media (max-width: 48rem)
    padding: calc($gap / 2)

  &__button
    +button-reset
    border: 1px solid rgba($brand, .35)
    padding: .5rem $gap

    &:hover
      color: darken($brand, 10%)
</style>
