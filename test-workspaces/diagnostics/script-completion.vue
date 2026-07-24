<script setup lang="ts">
const model = { save: true };
model.save;

function format(value: string, count: number): string {
  return value.repeat(count);
}
format("x", 1);
</script>

<template>
  <main />
</template>
