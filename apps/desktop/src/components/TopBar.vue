<script setup lang="ts">
import type { DesktopTab } from '@desktop/shared'
import type { ShellTheme } from '../composables/use-theme'
import { ContextMenuContent, ContextMenuItem, ContextMenuPortal, ContextMenuRoot, ContextMenuSeparator, ContextMenuTrigger } from 'reka-ui'
import { onBeforeUnmount, ref } from 'vue'

defineProps<{
  tabs: DesktopTab[]
  /** 窗口最大化状态：切换最大化按钮图标 */
  maximized?: boolean
  /** 应用中心面板展开态：入口按钮高亮 */
  appCenterOpen?: boolean
  /** 当前主题：切换主题按钮图标 */
  theme: ShellTheme
}>()

defineEmits<{
  activate: [tabId: string]
  close: [tabId: string]
  /** Tab 右键菜单动作（reka ContextMenu 页内渲染） */
  reload: [tabId: string]
  clearCache: [appId: string]
  clearSite: [appId: string]
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

// ---- Shell DOM 右键菜单与 Web 视图的层级协同 ----
// 菜单渲染在 Shell DOM（Portal 到 body），而激活的 WebContentsView 是原生合成层、
// 永远盖住 Shell DOM：菜单打开期间经 tabs.setViewSuppressed 让激活视图归零让位，
// 关闭后恢复。多个 Tab 菜单的开/关用集合归并，只在 0↔1 边界通知 Main，避免重复 IPC。
const openMenus = new Set<string>()
let suppressed = false

function onMenuOpen(tabId: string, value: boolean): void {
  if (value)
    openMenus.add(tabId)
  else openMenus.delete(tabId)
  const next = openMenus.size > 0
  if (next === suppressed)
    return
  suppressed = next
  void window.desktop.tabs.setViewSuppressed(next)
}

onBeforeUnmount(() => {
  if (!suppressed)
    return
  suppressed = false
  void window.desktop.tabs.setViewSuppressed(false)
})
</script>

<template>
  <!-- 沉浸式顶栏（飞书式）：品牌 / 应用中心 / Tab / 主题 / 窗口控制合一，
       整栏为窗口拖拽区，可交互控件一律 no-drag -->
  <div class="dt-topbar">
    <div class="dt-topbar__brand">
      Desktop
    </div>
    <button
      class="dt-topbar__center"
      :class="{ 'dt-topbar__center--open': appCenterOpen }"
      title="应用中心"
      @click="$emit('toggleCenter')"
    >
      应用中心
    </button>

    <div ref="tabsEl" class="dt-topbar__tabs" @wheel="onTabsWheel">
      <ContextMenuRoot
        v-for="tab in tabs"
        :key="tab.id"
        @update:open="value => onMenuOpen(tab.id, value)"
      >
        <ContextMenuTrigger as-child>
          <button
            class="dt-tab"
            :class="{ 'dt-tab--active': tab.active }"
            :title="tab.title"
            @click="$emit('activate', tab.id)"
          >
            <span class="dt-tab__title">{{ tab.title }}</span>
            <span
              class="dt-tab__close"
              title="关闭"
              @click.stop="$emit('close', tab.id)"
            >
              <svg viewBox="0 0 10 10" width="8" height="8"><path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" /></svg>
            </span>
          </button>
        </ContextMenuTrigger>
        <ContextMenuPortal>
          <ContextMenuContent class="dt-ctxmenu">
            <ContextMenuItem class="dt-ctxmenu__item" @select="$emit('reload', tab.id)">
              刷新页面
            </ContextMenuItem>
            <ContextMenuItem class="dt-ctxmenu__item" @select="$emit('clearCache', tab.appId)">
              清理缓存
            </ContextMenuItem>
            <ContextMenuItem class="dt-ctxmenu__item dt-ctxmenu__item--danger" @select="$emit('clearSite', tab.appId)">
              清除站点数据
            </ContextMenuItem>
            <ContextMenuSeparator class="dt-ctxmenu__sep" />
            <ContextMenuItem class="dt-ctxmenu__item" @select="$emit('close', tab.id)">
              关闭标签页
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenuPortal>
      </ContextMenuRoot>
    </div>

    <div class="dt-topbar__spacer" />

    <div class="dt-topbar__controls">
      <button class="dt-winbtn dt-winbtn--theme" title="切换主题" @click="$emit('toggleTheme')">
        <svg v-if="theme === 'light'" viewBox="0 0 16 16" width="14" height="14"><path d="M13.5 9.5A5.5 5.5 0 1 1 6.5 2.5a4.5 4.5 0 0 0 7 7Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" /></svg>
        <svg v-else viewBox="0 0 16 16" width="14" height="14"><circle cx="8" cy="8" r="3.2" fill="currentColor" /><g stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M8 1.2v1.6M8 13.2v1.6M1.2 8h1.6M13.2 8h1.6M3.2 3.2l1.1 1.1M11.7 11.7l1.1 1.1M12.8 3.2l-1.1 1.1M4.3 11.7l-1.1 1.1" /></g></svg>
      </button>
      <button class="dt-winbtn" title="最小化" @click="$emit('minimize')">
        <svg viewBox="0 0 10 10" width="10" height="10"><path d="M1 5h8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" /></svg>
      </button>
      <button class="dt-winbtn" :title="maximized ? '还原' : '最大化'" @click="$emit('toggleMaximize')">
        <svg v-if="!maximized" viewBox="0 0 10 10" width="10" height="10"><rect x="1.5" y="1.5" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.2" /></svg>
        <svg v-else viewBox="0 0 10 10" width="10" height="10"><rect x="1.5" y="3" width="5.5" height="5.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.2" /><path d="M3.5 1.5h5v5" fill="none" stroke="currentColor" stroke-width="1.2" /></svg>
      </button>
      <button class="dt-winbtn dt-winbtn--close" title="关闭" @click="$emit('closeWindow')">
        <svg viewBox="0 0 10 10" width="10" height="10"><path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" /></svg>
      </button>
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

/* Tab：hover 浅灰圆角块，激活 = 青玉浅底 + 底部主色指示条 + 常显关闭钮 */
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

/* 窗口控制按钮：SVG 细线图标，含主题切换 */
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
.dt-winbtn--close:hover {
  background: #e81123;
  color: #ffffff;
}
</style>

<!--
  Tab 右键菜单：reka ContextMenu 承担定位 / 键盘导航 / 无障碍，外观跟随 dt-* 主题令牌；
  打开期间激活 Web 视图归零让位（见 onMenuOpen），Portal 到 body 的内容不被遮挡。
  本块必须是非 scoped 样式——ContextMenuContent 经 Portal 渲染，Vue 的 scopeId 不会
  fallthrough 到其根元素，scoped 规则全部不命中（背景/边框/阴影整体丢失）；
  dt- 前缀类名防全局冲突。
-->
<style>
.dt-ctxmenu {
  z-index: 60;
  min-width: 184px;
  padding: 4px;
  border: 1px solid var(--dt-line);
  border-radius: var(--dt-radius-3);
  background: var(--dt-surface);
  /* 浮层菜单压在任意页面上：一级投影，10% 级弱阴影在浅色画布上不可感知 */
  box-shadow: 0 10px 28px rgba(2, 8, 20, 0.18), 0 2px 8px rgba(2, 8, 20, 0.1);
  animation: dt-menu-in 0.14s var(--dt-ease);
}
.dt-ctxmenu__item {
  display: flex;
  align-items: center;
  height: 28px;
  padding: 0 10px;
  border-radius: var(--dt-radius-1);
  font-size: 12.5px;
  color: var(--dt-text);
  cursor: pointer;
  user-select: none;
  transition: background 0.12s ease;
}
.dt-ctxmenu__item[data-highlighted] {
  background: var(--dt-hover);
  outline: none;
}
.dt-ctxmenu__item--danger {
  color: var(--dt-danger-text);
}
.dt-ctxmenu__item--danger[data-highlighted] {
  background: var(--dt-danger-soft);
}
.dt-ctxmenu__sep {
  height: 1px;
  margin: 4px 6px;
  border: none;
  background: var(--dt-line-soft);
}
@keyframes dt-menu-in {
  from {
    opacity: 0;
    transform: translateY(-4px) scale(0.98);
  }
}
</style>
