<template></template>

<script setup lang="ts"></script>

<style scoped></style>

<template>
  <section class="normal-blocks">
    <h1>{{ title }}</h1>
    <EmptyState />
  </section>
</template>

<script setup lang="ts">
const title = "Normal blocks after empty blocks";
</script>

<style scoped>
.normal-blocks {
  display: block;
  padding: 1rem;
}
</style>
