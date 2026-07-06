<template>
  <article>{{ count }}</article>
</template>

<script setup lang="ts">
defineProps<{
  count: number;
}>();
</script>
