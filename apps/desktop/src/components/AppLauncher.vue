<script setup lang="ts">
import type { DesktopTab, RegisteredApp } from '@desktop/shared'
import { computed } from 'vue'

const props = defineProps<{
  apps: RegisteredApp[]
  /** 当前 Tab 列表：激活 Tab 对应的导航项高亮 */
  tabs: DesktopTab[]
}>()

const emit = defineEmits<{ open: [appId: string] }>()

const activeAppId = computed(() => props.tabs.find(tab => tab.active)?.appId)
</script>

<template>
  <!-- 飞书式窄导航：图标上 / 文字下的纵排导航项，激活项蓝色高亮 -->
  <aside class="dt-launcher">
    <button
      v-for="app in apps"
      :key="app.manifest.id"
      class="dt-launcher__item"
      :class="{ 'dt-launcher__item--active': app.manifest.id === activeAppId }"
      :title="app.manifest.name"
      @click="emit('open', app.manifest.id)"
    >
      <span class="dt-launcher__icon">{{ app.manifest.name.slice(0, 1) }}</span>
      <span class="dt-launcher__name">{{ app.manifest.name }}</span>
    </button>
  </aside>
</template>

<style scoped>
.dt-launcher {
  width: 68px;
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: #ffffff;
  border-right: 1px solid #e7e9ec;
  padding: 8px 6px;
  overflow-y: auto;
}
.dt-launcher__item {
  width: 56px;
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  border: none;
  background: transparent;
  border-radius: 8px;
  padding: 8px 0;
  margin-bottom: 4px;
  cursor: pointer;
  font-family: inherit;
}
.dt-launcher__item:hover {
  background: #f2f3f5;
}
.dt-launcher__item--active {
  background: #edf3ff;
}
.dt-launcher__item--active .dt-launcher__name {
  color: #3370ff;
  font-weight: 500;
}
.dt-launcher__icon {
  width: 28px;
  height: 28px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  background: #3370ff;
  color: #ffffff;
  font-size: 13px;
  margin-bottom: 4px;
}
.dt-launcher__name {
  font-size: 11px;
  color: #4b5563;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 4px;
}
</style>
