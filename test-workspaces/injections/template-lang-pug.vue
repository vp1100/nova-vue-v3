<template lang="pug">
section.pug-card
  h1 {{ title }}
  button.pug-card__button(type="button" @click="save")
    | Save
  div
  
</template>

<script setup lang="ts">
const title = "Pug fixture";

function save() {
  console.log(title);
}
</script>

<style scoped>
.pug-card {
  color: #1f2937;
}
</style>
