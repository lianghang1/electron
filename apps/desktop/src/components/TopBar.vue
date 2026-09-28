<script setup lang="ts">
import type { DesktopTab } from '@desktop/shared'
import { onBeforeUnmount, onMounted, ref } from 'vue'

defineProps<{
  tabs: DesktopTab[]
  /** 窗口最大化状态：切换最大化按钮图标 */
  maximized?: boolean
  /** 应用中心面板展开态：入口按钮高亮 */
  appCenterOpen?: boolean
}>()

const emit = defineEmits<{
  activate: [tabId: string]
  close: [tabId: string]
  reload: [tabId: string]
  toggleCenter: []
  minimize: []
  toggleMaximize: []
  closeWindow: []
  cacheClear: [appId: string]
  cacheClearSite: [appId: string]
}>()

// ---- Tab 右键菜单：刷新 / 清理缓存 / 清除站点数据 / 关闭 ----
const MENU_W = 168
const MENU_H = 152
/** 清除站点数据需二次点击确认（armed 后菜单项变确认文案，再次点击才执行） */
const menu = ref<{ tab: DesktopTab, x: number, y: number, armedSite: boolean } | null>(null)

function openMenu(tab: DesktopTab, e: MouseEvent): void {
  const x = Math.min(e.clientX, window.innerWidth - MENU_W - 8)
  const y = Math.min(e.clientY, window.innerHeight - MENU_H - 8)
  menu.value = { tab, x, y, armedSite: false }
}

function closeMenu(): void {
  menu.value = null
}

function onMenu(action: 'reload' | 'cache' | 'site' | 'close'): void {
  const target = menu.value
  if (!target)
    return
  if (action === 'site' && !target.armedSite) {
    target.armedSite = true
    return
  }
  closeMenu()
  const appId = target.tab.appId
  if (action === 'reload')
    emit('reload', target.tab.id)
  else if (action === 'close')
    emit('close', target.tab.id)
  else if (action === 'cache')
    emit('cacheClear', appId)
  else if (action === 'site')
    emit('cacheClearSite', appId)
}

onMounted(() => {
  document.addEventListener('click', closeMenu)
  document.addEventListener('contextmenu', closeMenu)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', closeMenu)
  document.removeEventListener('contextmenu', closeMenu)
})
</script>

<template>
  <!-- 沉浸式顶栏（飞书式）：品牌 / 应用中心 / Tab / 窗口控制合一，
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

    <div class="dt-topbar__tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="dt-tab"
        :class="{ 'dt-tab--active': tab.active }"
        :title="tab.title"
        @click="$emit('activate', tab.id)"
        @contextmenu.prevent.stop="openMenu(tab, $event)"
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
    </div>

    <div class="dt-topbar__spacer" />

    <div class="dt-topbar__controls">
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

    <!-- Tab 右键菜单 -->
    <div
      v-if="menu"
      class="dt-menu"
      :style="{ left: `${menu.x}px`, top: `${menu.y}px` }"
      @contextmenu.prevent
    >
      <button class="dt-menu__item" @click.stop="onMenu('reload')">
        刷新页面
      </button>
      <button class="dt-menu__item" @click.stop="onMenu('cache')">
        清理缓存
      </button>
      <button
        class="dt-menu__item"
        :class="{ 'dt-menu__item--danger': menu.armedSite }"
        @click.stop="onMenu('site')"
      >
        {{ menu.armedSite ? '将退出登录，再点一次确认' : '清除站点数据…' }}
      </button>
      <div class="dt-menu__sep" />
      <button class="dt-menu__item" @click.stop="onMenu('close')">
        关闭标签页
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
  background: #ffffff;
  border-bottom: 1px solid #e7e9ec;
  padding-left: 12px;
  -webkit-app-region: drag;
}
.dt-topbar__brand {
  font-size: 13px;
  font-weight: 600;
  color: #1f2328;
  margin-right: 10px;
}
.dt-topbar__center {
  border: none;
  background: transparent;
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12px;
  color: #6b7280;
  cursor: pointer;
  font-family: inherit;
  -webkit-app-region: no-drag;
  transition: background 0.12s, color 0.12s;
}
.dt-topbar__center:hover {
  background: #f2f3f5;
  color: #1f2328;
}
.dt-topbar__center--open {
  background: #3370ff;
  color: #ffffff;
}
.dt-topbar__center--open:hover {
  background: #2860e1;
  color: #ffffff;
}
.dt-topbar__tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  overflow-x: auto;
  min-width: 0;
  -webkit-app-region: no-drag;
}
.dt-topbar__spacer {
  flex: 1;
  height: 100%;
}

/* Tab：hover 浅灰圆角块，激活 = 深色文字 + 底部品牌色指示条 + 常显关闭钮 */
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
  color: #6b7280;
  cursor: pointer;
  white-space: nowrap;
  font-family: inherit;
  flex: none;
  transition: background 0.12s, color 0.12s;
}
.dt-tab:hover {
  background: #f2f3f5;
  color: #1f2328;
}
.dt-tab--active {
  background: #eef4ff;
  color: #1f2937;
  font-weight: 500;
}
.dt-tab--active:hover {
  background: #e6efff;
}
.dt-tab--active::after {
  content: '';
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: -6px;
  height: 2px;
  border-radius: 2px;
  background: #3370ff;
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
  color: #9ca3af;
  margin-left: 4px;
  opacity: 0;
  transition: opacity 0.12s, background 0.12s, color 0.12s;
}
.dt-tab:hover .dt-tab__close,
.dt-tab--active .dt-tab__close {
  opacity: 1;
}
.dt-tab__close:hover {
  background: #dfe3e8;
  color: #1f2328;
}

/* 窗口控制按钮：SVG 细线图标 */
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
  color: #6b7280;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.dt-winbtn:hover {
  background: #f2f3f5;
  color: #1f2328;
}
.dt-winbtn--close:hover {
  background: #e81123;
  color: #ffffff;
}

/* Tab 右键菜单 */
.dt-menu {
  position: fixed;
  z-index: 1000;
  width: 168px;
  padding: 4px;
  background: #ffffff;
  border: 1px solid #e7e9ec;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgb(15 23 42 / 12%);
  -webkit-app-region: no-drag;
}
.dt-menu__item {
  display: block;
  width: 100%;
  border: none;
  background: transparent;
  border-radius: 5px;
  padding: 6px 10px;
  font-size: 12.5px;
  color: #1f2328;
  text-align: left;
  cursor: pointer;
  font-family: inherit;
}
.dt-menu__item:hover {
  background: #f2f3f5;
}
.dt-menu__item--danger {
  color: #d92d20;
}
.dt-menu__item--danger:hover {
  background: #fef3f2;
}
.dt-menu__sep {
  height: 1px;
  margin: 4px 6px;
  background: #f3f4f6;
}
</style>
