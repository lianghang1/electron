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

/** 字母头像柔和色板（按 appId 稳定取色保证辨识度；浅底淡彩，非高饱和实心块） */
const AVATAR_COLORS = ['#0f9d8f', '#7c5cff', '#e0663c', '#c2379e', '#2f8af5', '#d9a514']
function avatarColor(appId: string): string {
  let hash = 0
  for (const ch of appId) { hash = (hash * 31 + ch.charCodeAt(0)) | 0 }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}
</script>

<template>
  <!-- 左侧应用导航（84px 窄栏）：图标 + 名称直出的卡片式按钮（名称常显，不依赖 Tooltip——
       内容区为原生 WebContentsView，DOM Tooltip 会被其盖住）。
       默认浅灰卡、悬停加深、激活品牌色实底反白 -->
  <nav class="dt-launcher" aria-label="应用导航">
    <button
      v-for="app in apps"
      :key="app.manifest.id"
      class="dt-launcher__item"
      :class="{ 'dt-launcher__item--active': app.manifest.id === activeAppId }"
      :title="`打开 ${app.manifest.name}`"
      @click="emit('open', app.manifest.id)"
    >
      <img
        v-if="app.manifest.icon"
        :src="app.manifest.icon"
        alt=""
        class="dt-launcher__img"
      >
      <span
        v-else
        class="dt-launcher__letter"
        :style="{ '--dt-app-color': avatarColor(app.manifest.id) }"
      >{{ app.manifest.name.slice(0, 1) }}</span>
      <span class="dt-launcher__label">{{ app.manifest.name }}</span>
    </button>
  </nav>
</template>

<style scoped>
.dt-launcher {
  width: 84px;
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px 10px;
  background: var(--dt-surface);
  border-right: 1px solid var(--dt-line);
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: none;
}
.dt-launcher::-webkit-scrollbar {
  display: none;
}
.dt-launcher__item {
  width: 64px;
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px 4px 8px;
  border: none;
  background: var(--dt-bg);
  border-radius: var(--dt-radius-4);
  color: var(--dt-text-2);
  cursor: pointer;
  font-family: inherit;
  transition:
    background var(--dt-dur) var(--dt-ease),
    color var(--dt-dur) var(--dt-ease);
}
.dt-launcher__item:hover {
  background: var(--dt-hover);
}
.dt-launcher__item--active {
  background: var(--dt-brand);
  color: var(--dt-brand-on);
}
.dt-launcher__item--active:hover {
  background: var(--dt-brand-hover);
}
.dt-launcher__item:focus-visible {
  outline: 2px solid var(--dt-brand);
  outline-offset: 1px;
}
.dt-launcher__item--active:focus-visible {
  outline-color: var(--dt-brand-text);
}
.dt-launcher__img {
  width: 24px;
  height: 24px;
  border-radius: var(--dt-radius-1);
  object-fit: cover;
}
/* 首字母淡彩头像：14% 底色 + 原色文字；激活态反白与卡片实底呼应 */
.dt-launcher__letter {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--dt-radius-2);
  background: color-mix(in srgb, var(--dt-app-color) 14%, var(--dt-surface));
  color: var(--dt-app-color);
  font-size: 13px;
  font-weight: 600;
  transition: background var(--dt-dur) var(--dt-ease), color var(--dt-dur) var(--dt-ease);
}
.dt-launcher__item--active .dt-launcher__letter {
  background: rgb(255 255 255 / 22%);
  color: var(--dt-brand-on);
}
.dt-launcher__label {
  max-width: 100%;
  font-size: 11px;
  line-height: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
