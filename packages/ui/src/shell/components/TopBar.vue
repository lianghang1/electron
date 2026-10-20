<script setup lang="ts">
import type { DesktopTab } from '@desktop/shared'
import type { ShellTheme } from '../composables/use-theme'
import { ref } from 'vue'
import AppTooltip from './AppTooltip.vue'
import WindowControls from './WindowControls.vue'

defineProps<{
  tabs: DesktopTab[]
  /** 窗口最大化状态：切换最大化按钮图标 */
  maximized?: boolean
  /** 当前主题：切换主题按钮图标 */
  theme: ShellTheme
  /** 资源模式：隐藏应用中心/主题切换；Tab 条仅在多资源声明时保留（单资源由品牌区替代） */
  resource?: boolean
  /** 宿主应用名称（bootstrap app.name）：品牌区展示，资源与非资源模式一致 */
  hostName?: string
}>()

defineEmits<{
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
  <!-- 单层顶栏：品牌 / 应用中心 / 标签 / 主题 / 窗口控制合一；
       整栏为窗口拖拽区，可交互控件一律 no-drag -->
  <header class="dt-topbar">
    <div class="dt-topbar__brand">
      <span class="dt-topbar__logo">
        <svg viewBox="0 0 14 14" width="12" height="12">
          <g fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round">
            <rect x="1.5" y="1.5" width="4.4" height="4.4" rx="1.2" />
            <rect x="8.1" y="1.5" width="4.4" height="4.4" rx="1.2" />
            <rect x="1.5" y="8.1" width="4.4" height="4.4" rx="1.2" />
            <rect x="8.1" y="8.1" width="4.4" height="4.4" rx="1.2" />
          </g>
        </svg>
      </span>
      {{ hostName || 'Desktop' }}
    </div>
    <AppTooltip v-if="!resource" text="打开应用中心">
      <button class="dt-chip" @click="$emit('toggleCenter')">
        <svg viewBox="0 0 14 14" width="12" height="12">
          <g fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round">
            <rect x="1.5" y="1.5" width="4.4" height="4.4" rx="1.2" />
            <rect x="8.1" y="1.5" width="4.4" height="4.4" rx="1.2" />
            <rect x="1.5" y="8.1" width="4.4" height="4.4" rx="1.2" />
            <rect x="8.1" y="8.1" width="4.4" height="4.4" rx="1.2" />
          </g>
        </svg>
        应用中心
      </button>
    </AppTooltip>
    <!-- Tab 条：非资源模式恒显；资源模式仅多资源声明时保留（单资源由品牌区替代） -->
    <div v-if="!resource || tabs.length > 1" ref="tabsEl" class="dt-topbar__tabs" @wheel="onTabsWheel">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="dt-tab"
        :class="{ 'dt-tab--active': tab.active, 'dt-tab--fixed': resource }"
        :title="tab.title"
        @click="$emit('activate', tab.id)"
        @contextmenu.prevent="$emit('contextMenu', tab, $event.clientX, $event.clientY)"
      >
        <!-- 固定 Tab（资源模式）：锁形图标标识常驻，无关闭入口 -->
        <svg v-if="resource" class="dt-tab__lock" viewBox="0 0 12 12" width="10" height="10">
          <rect x="2.2" y="5" width="7.6" height="5.4" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.2" />
          <path d="M4 5V3.6a2 2 0 0 1 4 0V5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
        </svg>
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
          v-if="!resource"
          class="dt-tab__close"
          title="关闭"
          @click.stop="$emit('close', tab.id)"
        >
          <svg viewBox="0 0 10 10" width="8" height="8"><path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" /></svg>
        </span>
      </button>
    </div>

    <div class="dt-topbar__spacer" />

    <AppTooltip v-if="!resource" :text="theme === 'light' ? '切换深色模式' : '切换浅色模式'">
      <button class="dt-topbar__iconbtn" @click="$emit('toggleTheme')">
        <svg v-if="theme === 'light'" viewBox="0 0 16 16" width="15" height="15"><path d="M13.5 9.5A5.5 5.5 0 1 1 6.5 2.5a4.5 4.5 0 0 0 7 7Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" /></svg>
        <svg v-else viewBox="0 0 16 16" width="15" height="15"><circle cx="8" cy="8" r="3.2" fill="currentColor" /><g stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M8 1.2v1.6M8 13.2v1.6M1.2 8h1.6M13.2 8h1.6M3.2 3.2l1.1 1.1M11.7 11.7l1.1 1.1M12.8 3.2l-1.1 1.1M4.3 11.7l-1.1 1.1" /></g></svg>
      </button>
    </AppTooltip>
    <span v-if="!resource" class="dt-topbar__sep" />
    <WindowControls
      :maximized="maximized"
      @minimize="$emit('minimize')"
      @toggle-maximize="$emit('toggleMaximize')"
      @close-window="$emit('closeWindow')"
    />
  </header>
</template>

<style scoped>
.dt-topbar {
  position: relative;
  z-index: 2;
  height: 44px;
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding-left: 12px;
  background: var(--dt-surface);
  border-bottom: 1px solid var(--dt-line);
  -webkit-app-region: drag;
}
.dt-topbar__brand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--dt-text);
  margin-right: 2px;
}
.dt-topbar__logo {
  width: 22px;
  height: 22px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--dt-radius-2);
  background: var(--dt-brand);
  color: var(--dt-brand-on);
}

/* 应用中心入口：图标 + 文字按钮 */
.dt-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 11px;
  border: none;
  background: transparent;
  border-radius: var(--dt-radius-1);
  font-size: 12.5px;
  font-family: inherit;
  color: var(--dt-text-2);
  cursor: pointer;
  -webkit-app-region: no-drag;
  transition: background var(--dt-dur) var(--dt-ease), color var(--dt-dur) var(--dt-ease);
}
.dt-chip:hover {
  background: var(--dt-surface-hover);
  color: var(--dt-text);
}

.dt-topbar__tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  overflow-x: auto;
  overflow-y: hidden;
  min-width: 0;
  -webkit-app-region: no-drag;
  /* Tab 条不显示滚动条（滚动条会挤压高度连带出竖向滚动条），滚轮横滚代替 */
  scrollbar-width: none;
}
.dt-topbar__tabs::-webkit-scrollbar {
  display: none;
}
.dt-topbar__spacer {
  flex: 1;
  height: 100%;
}

/* 扁平 Tab：无完整边框，激活 = 浅品牌底 + 品牌文字 */
.dt-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  border: none;
  border-radius: var(--dt-radius-2);
  background: transparent;
  padding: 0 6px 0 12px;
  font-size: 12.5px;
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
/* 固定 Tab（资源模式）：无关闭钮，左右内边距对称 */
.dt-tab--fixed {
  padding: 0 12px;
}
.dt-tab__lock {
  flex: none;
  opacity: 0.7;
}
.dt-tab__spinner {
  flex: none;
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
  border-radius: var(--dt-radius-1);
  color: var(--dt-text-3);
  margin-left: 2px;
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

/* 主题切换：窗口控制左侧的图标按钮 */
.dt-topbar__iconbtn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  border-radius: var(--dt-radius-1);
  color: var(--dt-text-2);
  cursor: pointer;
  -webkit-app-region: no-drag;
  transition: background var(--dt-dur) var(--dt-ease), color var(--dt-dur) var(--dt-ease);
}
.dt-topbar__iconbtn:hover {
  background: var(--dt-surface-hover);
  color: var(--dt-text);
}
/* 主题切换与窗口控制之间的分隔线 */
.dt-topbar__sep {
  width: 1px;
  height: 20px;
  flex: none;
  background: var(--dt-line);
  margin: 0 6px;
}
</style>
