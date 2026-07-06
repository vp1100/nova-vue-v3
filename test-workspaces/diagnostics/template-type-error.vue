<template>
  <button>
    {{ count.toUpperCase() }}
  </button>
</template>

<script setup lang="ts">
const count = ref(0);

count;
</script>
