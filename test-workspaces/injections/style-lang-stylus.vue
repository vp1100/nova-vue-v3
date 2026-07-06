<template>
  <section class="stylus-card">
    <h1>{{ title }}</h1>
    <button class="stylus-card__button" type="button">Save</button>
  </section>
</template>

<script setup lang="ts">
const title = "Stylus fixture";
</script>

<style lang="stylus" scoped>
.stylus-card
  color #1f2937

  &__button
    appearance none
    border 1px solid #94a3b8
    padding .5rem .75rem
</style>
