<script setup lang="ts">
import type { DesktopTab, RegisteredApp } from '@desktop/shared'
import { computed } from 'vue'
import AppTooltip from './AppTooltip.vue'

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
  <!-- 左侧应用导航（72px 窄栏）：字母头像（无自定义图标时）+ 悬停 Tooltip，
       默认中性、悬停浅灰底、激活浅品牌底 + 左侧品牌指示条 -->
  <nav class="dt-launcher" aria-label="应用导航">
    <AppTooltip v-for="app in apps" :key="app.manifest.id" :text="app.manifest.name">
      <button
        class="dt-launcher__item"
        :class="{ 'dt-launcher__item--active': app.manifest.id === activeAppId }"
        @click="emit('open', app.manifest.id)"
      >
        <!-- 有自定义图标用图片，否则用首字母淡彩头像（同色系深浅区分应用） -->
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
        <span v-if="app.manifest.id === activeAppId" class="dt-launcher__indicator" />
      </button>
    </AppTooltip>
  </nav>
</template>

<style scoped>
.dt-launcher {
  width: 72px;
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px;
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
  position: relative;
  width: 48px;
  height: 48px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  border-radius: var(--dt-radius-4);
  color: var(--dt-text-2);
  cursor: pointer;
  font-family: inherit;
  transition: background var(--dt-dur) var(--dt-ease), color var(--dt-dur) var(--dt-ease);
}
.dt-launcher__item:hover {
  background: var(--dt-surface-hover);
}
.dt-launcher__item--active {
  background: var(--dt-brand-soft);
  color: var(--dt-brand-text);
}
.dt-launcher__item:focus-visible {
  outline: 2px solid var(--dt-brand);
  outline-offset: -2px;
}
.dt-launcher__img {
  width: 22px;
  height: 22px;
  border-radius: var(--dt-radius-1);
  object-fit: cover;
}
/* 首字母淡彩头像：14% 底色 + 原色文字，既可辨识又不高饱和 */
.dt-launcher__letter {
  width: 26px;
  height: 26px;
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
/* 激活态字母加深一档，与浅品牌底仍保持色相区分 */
.dt-launcher__item--active .dt-launcher__letter {
  background: color-mix(in srgb, var(--dt-app-color) 24%, var(--dt-surface));
  color: color-mix(in srgb, var(--dt-app-color) 78%, #000);
}
/* 激活指示条：绝对定位于项左缘，不引起图标偏移 */
.dt-launcher__indicator {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 22px;
  border-radius: 0 2px 2px 0;
  background: var(--dt-brand);
}
</style>
