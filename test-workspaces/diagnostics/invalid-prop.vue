<template>
  <DiagnosticChild :count="'not a number'" />
</template>

<script setup lang="ts">
import DiagnosticChild from "./valid-child.vue";
</script>
