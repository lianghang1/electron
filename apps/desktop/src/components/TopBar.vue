<script setup lang="ts">
import type { DesktopTab } from '@desktop/shared'
import type { ShellTheme } from '../composables/use-theme'
import { ref } from 'vue'
import WindowControls from './WindowControls.vue'

defineProps<{
  tabs: DesktopTab[]
  /** 窗口最大化状态：切换最大化按钮图标 */
  maximized?: boolean
  /** 应用中心面板展开态：入口按钮高亮 */
  appCenterOpen?: boolean
  /** 当前主题：切换主题按钮图标 */
  theme: ShellTheme
  /** 套壳模式：只保留 Tab 条与窗口控制（无品牌/应用中心/主题），Tab 不提供关闭入口 */
  single?: boolean
}>()

const emit = defineEmits<{
  activate: [tabId: string]
  close: [tabId: string]
  /** Tab 右键：转发锚点坐标（内容区 DIP），菜单经原生浮层窗渲染（页面内容保持可见） */
  contextMenu: [tab: DesktopTab, x: number, y: number]
  toggleCenter: []
  toggleTheme: []
  minimize: []
  toggleMaximize: []
  closeWindow: []
}>()

const tabsEl = ref<HTMLElement | null>(null)

/** Tab 条不显示滚动条：竖向滚轮转横向滚动（Chrome 行为） */
function onTabsWheel(e: WheelEvent): void {
  tabsEl.value?.scrollBy({ left: e.deltaY })
}
</script>

<template>
  <!-- 沉浸式顶栏（飞书式）：品牌 / 应用中心 / Tab / 主题 / 窗口控制合一，
       整栏为窗口拖拽区，可交互控件一律 no-drag -->
  <div class="dt-topbar">
    <div v-if="!single" class="dt-topbar__brand">
      Desktop
    </div>
    <button
      v-if="!single"
      class="dt-topbar__center"
      :class="{ 'dt-topbar__center--open': appCenterOpen }"
      title="应用中心"
      @click="$emit('toggleCenter')"
    >
      应用中心
    </button>
    <div ref="tabsEl" class="dt-topbar__tabs" @wheel="onTabsWheel">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="dt-tab"
        :class="{ 'dt-tab--active': tab.active, 'dt-tab--fixed': single }"
        :title="tab.title"
        @click="$emit('activate', tab.id)"
        @contextmenu.prevent="$emit('contextMenu', tab, $event.clientX, $event.clientY)"
      >
        <svg
          v-if="tab.isLoading"
          class="dt-tab__spinner"
          viewBox="0 0 16 16"
          width="12"
          height="12"
        >
          <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-dasharray="28" />
        </svg>
        <span class="dt-tab__title">{{ tab.title }}</span>
        <span
          v-if="!single"
          class="dt-tab__close"
          title="关闭"
          @click.stop="$emit('close', tab.id)"
        >
          <svg viewBox="0 0 10 10" width="8" height="8"><path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" /></svg>
        </span>
      </button>
    </div>

    <div class="dt-topbar__spacer" />

    <div class="dt-topbar__controls">
      <button v-if="!single" class="dt-winbtn dt-winbtn--theme" title="切换主题" @click="$emit('toggleTheme')">
        <svg v-if="theme === 'light'" viewBox="0 0 16 16" width="14" height="14"><path d="M13.5 9.5A5.5 5.5 0 1 1 6.5 2.5a4.5 4.5 0 0 0 7 7Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" /></svg>
        <svg v-else viewBox="0 0 16 16" width="14" height="14"><circle cx="8" cy="8" r="3.2" fill="currentColor" /><g stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M8 1.2v1.6M8 13.2v1.6M1.2 8h1.6M13.2 8h1.6M3.2 3.2l1.1 1.1M11.7 11.7l1.1 1.1M12.8 3.2l-1.1 1.1M4.3 11.7l-1.1 1.1" /></g></svg>
      </button>
      <WindowControls
        :maximized="maximized"
        @minimize="$emit('minimize')"
        @toggle-maximize="$emit('toggleMaximize')"
        @close-window="$emit('closeWindow')"
      />
    </div>
  </div>
</template>

<style scoped>
.dt-topbar {
  height: 40px;
  flex: none;
  display: flex;
  align-items: center;
  background: var(--dt-surface);
  border-bottom: 1px solid var(--dt-line);
  padding-left: 12px;
  -webkit-app-region: drag;
  /* 缎面微光：暗色下顶部 1px 内高光，替代毛玻璃质感 */
  box-shadow: var(--dt-glow);
  transition: background var(--dt-dur) var(--dt-ease), border-color var(--dt-dur) var(--dt-ease);
}
.dt-topbar__brand {
  font-size: 13px;
  font-weight: 600;
  color: var(--dt-text);
  margin-right: 10px;
}
.dt-topbar__center {
  border: none;
  background: transparent;
  border-radius: var(--dt-radius-1);
  padding: 4px 10px;
  font-size: 12px;
  color: var(--dt-text-2);
  cursor: pointer;
  font-family: inherit;
  -webkit-app-region: no-drag;
  transition: background var(--dt-dur) var(--dt-ease), color var(--dt-dur) var(--dt-ease);
}
.dt-topbar__center:hover {
  background: var(--dt-hover);
  color: var(--dt-text);
}
.dt-topbar__center--open {
  background: var(--dt-brand);
  color: var(--dt-brand-on);
}
.dt-topbar__center--open:hover {
  background: var(--dt-brand-hover);
  color: var(--dt-brand-on);
}

.dt-topbar__tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  overflow-x: auto;
  overflow-y: hidden;
  min-width: 0;
  -webkit-app-region: no-drag;
  /* Tab 条不显示滚动条（滚动条会挤压 40px 高度连带出竖向滚动条），滚轮横滚代替 */
  scrollbar-width: none;
}
.dt-topbar__tabs::-webkit-scrollbar {
  display: none;
}
.dt-topbar__spacer {
  flex: 1;
  height: 100%;
}

/* Tab：hover 浅灰圆角块，激活 = 青玉浅底 + 底部主色指示条 + 常显关闭钮（套壳模式不渲染） */
.dt-tab {
  position: relative;
  display: flex;
  align-items: center;
  height: 28px;
  border: none;
  border-radius: 7px;
  background: transparent;
  padding: 0 6px 0 12px;
  font-size: 13px;
  color: var(--dt-text-2);
  cursor: pointer;
  white-space: nowrap;
  font-family: inherit;
  flex: none;
  transition: background var(--dt-dur) var(--dt-ease), color var(--dt-dur) var(--dt-ease);
}
.dt-tab:hover {
  background: var(--dt-hover);
  color: var(--dt-text);
}
.dt-tab--active {
  background: var(--dt-brand-soft);
  color: var(--dt-brand-text);
  font-weight: 500;
}
.dt-tab--active::after {
  content: '';
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: -6px;
  height: 2px;
  border-radius: 2px;
  background: var(--dt-brand);
}
/* 固定 Tab（套壳模式）：无关闭钮，左右内边距对称 */
.dt-tab--fixed {
  padding: 0 12px;
}
.dt-tab__spinner {
  flex: none;
  margin-right: 6px;
  color: var(--dt-brand);
  animation: dt-tab-spin 0.9s linear infinite;
}

@keyframes dt-tab-spin {
  to {
    transform: rotate(360deg);
  }
}

.dt-tab__title {
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 150px;
}
.dt-tab__close {
  width: 18px;
  height: 18px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 5px;
  color: var(--dt-text-3);
  margin-left: 4px;
  opacity: 0;
  transition: opacity var(--dt-dur) var(--dt-ease), background var(--dt-dur) var(--dt-ease), color var(--dt-dur) var(--dt-ease);
}
.dt-tab:hover .dt-tab__close,
.dt-tab--active .dt-tab__close {
  opacity: 1;
}
.dt-tab__close:hover {
  background: var(--dt-hover);
  color: var(--dt-text);
}

/* 主题切换按钮：复用窗口控制按钮基类视觉（基类实现见 WindowControls.vue） */
.dt-topbar__controls {
  display: flex;
  height: 100%;
  flex: none;
  -webkit-app-region: no-drag;
}
.dt-winbtn {
  width: 44px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--dt-text-2);
  cursor: pointer;
  transition: background var(--dt-dur) var(--dt-ease), color var(--dt-dur) var(--dt-ease);
}
.dt-winbtn:hover {
  background: var(--dt-hover);
  color: var(--dt-text);
}
.dt-winbtn--theme {
  width: 36px;
}
</style>
