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

/** 字母头像柔和色板（按 appId 稳定取色，避免全青玉一片；识别色与主题主色无关） */
const AVATAR_COLORS = ['#0f9d8f', '#7c5cff', '#e0663c', '#c2379e', '#2f8af5', '#d9a514']
function avatarColor(appId: string): string {
  let hash = 0
  for (const ch of appId) hash = (hash * 31 + ch.charCodeAt(0)) | 0
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}
</script>

<template>
  <!-- 飞书式窄导航：图标上 / 文字下的纵排导航项，激活项主色高亮 + 左侧指示条 -->
  <aside class="dt-launcher">
    <button
      v-for="app in apps"
      :key="app.manifest.id"
      class="dt-launcher__item"
      :class="{ 'dt-launcher__item--active': app.manifest.id === activeAppId }"
      :title="app.manifest.name"
      @click="emit('open', app.manifest.id)"
    >
      <span class="dt-launcher__icon" :style="{ background: avatarColor(app.manifest.id) }">
        {{ app.manifest.name.slice(0, 1) }}
      </span>
      <span class="dt-launcher__name">{{ app.manifest.name }}</span>
    </button>
  </aside>
</template>

<style scoped>
.dt-launcher {
  width: 72px;
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  background: var(--dt-surface);
  border-right: 1px solid var(--dt-line);
  padding: 10px 8px;
  overflow-y: auto;
  overflow-x: hidden;
  transition: background var(--dt-dur) var(--dt-ease), border-color var(--dt-dur) var(--dt-ease);
}
.dt-launcher__item {
  position: relative;
  width: 100%;
  max-width: 56px;
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  border: none;
  background: transparent;
  border-radius: 8px;
  padding: 8px 0 7px;
  cursor: pointer;
  font-family: inherit;
  transition: background var(--dt-dur) var(--dt-ease);
}
.dt-launcher__item:hover {
  background: var(--dt-hover);
}
.dt-launcher__item--active {
  background: var(--dt-brand-soft);
}
.dt-launcher__item--active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 22px;
  border-radius: 0 3px 3px 0;
  background: var(--dt-brand);
}
.dt-launcher__icon {
  width: 32px;
  height: 32px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  color: #ffffff;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 5px;
  box-shadow: 0 1px 3px rgb(15 23 42 / 14%);
}
.dt-launcher__name {
  font-size: 11px;
  color: var(--dt-text-2);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 4px;
  transition: color var(--dt-dur) var(--dt-ease);
}
.dt-launcher__item--active .dt-launcher__name {
  color: var(--dt-brand-text);
  font-weight: 600;
}
</style>
