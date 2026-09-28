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

/** 字母头像柔和色板（按 appId 稳定取色，避免全蓝一片） */
const AVATAR_COLORS = ['#3370ff', '#0f9d8f', '#7c5cff', '#e0663c', '#c2379e', '#2f8af5']
function avatarColor(appId: string): string {
  let hash = 0
  for (const ch of appId) hash = (hash * 31 + ch.charCodeAt(0)) | 0
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}
</script>

<template>
  <!-- 飞书式窄导航：图标上 / 文字下的纵排导航项，激活项品牌色高亮 + 左侧指示条 -->
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
  background: #ffffff;
  border-right: 1px solid #e7e9ec;
  padding: 10px 8px;
  overflow-y: auto;
}
.dt-launcher__item {
  position: relative;
  width: 56px;
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
  transition: background 0.12s;
}
.dt-launcher__item:hover {
  background: #f2f3f5;
}
.dt-launcher__item--active {
  background: #f2f7ff;
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
  background: #3370ff;
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
  color: #4b5563;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 4px;
  transition: color 0.12s;
}
.dt-launcher__item--active .dt-launcher__name {
  color: #3370ff;
  font-weight: 600;
}
</style>
