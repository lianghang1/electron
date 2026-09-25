<script setup lang="ts">
import type { DesktopAppManifest } from '@desktop/shared'

defineProps<{ apps: DesktopAppManifest[] }>()

const emit = defineEmits<{ open: [appId: string] }>()
</script>

<template>
  <aside class="dt-launcher">
    <div class="dt-launcher__title">
      应用
    </div>
    <button
      v-for="app in apps"
      :key="app.id"
      class="dt-launcher__item"
      :title="app.name"
      @click="emit('open', app.id)"
    >
      <span class="dt-launcher__icon">{{ app.name.slice(0, 1) }}</span>
      <span class="dt-launcher__name">{{ app.name }}</span>
    </button>
  </aside>
</template>

<style scoped>
.dt-launcher {
  width: 168px;
  flex: none;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  border-right: 1px solid #e5e7eb;
  padding: 12px 8px;
}
.dt-launcher__title {
  font-size: 12px;
  color: #9ca3af;
  padding: 0 8px;
  margin-bottom: 8px;
}
.dt-launcher__item {
  display: flex;
  align-items: center;
  border: none;
  background: transparent;
  border-radius: 8px;
  padding: 8px;
  margin-bottom: 2px;
  cursor: pointer;
  font-size: 13px;
  color: #1f2328;
  text-align: left;
  font-family: inherit;
}
.dt-launcher__item:hover {
  background: #f3f4f6;
}
.dt-launcher__icon {
  width: 24px;
  height: 24px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: #0d9f6e;
  color: #ffffff;
  font-size: 12px;
  margin-right: 8px;
}
.dt-launcher__name {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
