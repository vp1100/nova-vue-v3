<template>
  <section class="dashboard">
    <MetricCard label="Revenue" value="$42k" />
    <MetricCard label="Users" value="1,284" />

    <article class="dashboard__summary">
      <Avatar user-id="vp1100" />
      <p>
        Account health is
        <strong>excellent</strong>
        after the latest release.
      </p>
      <img src="/status.svg" alt="Status illustration" />
      <input v-model="query" type="search" />
      <br />
      <InlineNotice />
    </article>
  </section>
</template>

<script setup lang="ts">
const query = "";
</script>

<style scoped>
.dashboard {
  display: grid;
  gap: 1rem;
}

.dashboard__summary {
  border: 1px solid #d1d5db;
  padding: 1rem;
}
</style>
