<template>
  <main class="layout">
    <NavBar />

    <section class="layout__content">
      <NavItem label="Overview" />
      <NavItem label="Projects" active />

      <article class="panel">
        <header class="panel__header">
          <IconChevron direction="right" />
          <h1>{{ title }}</h1>
          <StatusBadge status="ready" />
        </header>

        <p>Self-closing component tags should stay leaf-level in the symbol path.</p>
      </article>
    </section>
  </main>
</template>

<script setup lang="ts">
const title = "Self-closing component fixture";
</script>

<style scoped>
.layout {
  min-height: 100%;
}

.panel__header {
  align-items: center;
  display: flex;
  gap: 0.5rem;
}
</style>
