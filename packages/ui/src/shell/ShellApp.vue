<script setup lang="ts">
import type { DesktopTab, WorkAreaRect } from '@desktop/shared'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import AppLauncher from './components/AppLauncher.vue'
import CommandPalette from './components/CommandPalette.vue'
import TopBar from './components/TopBar.vue'
import UpdateBar from './components/UpdateBar.vue'
import { useApps } from './composables/use-apps'
import { useTabs } from './composables/use-tabs'
import { useTheme } from './composables/use-theme'

// Shell 自包含样式：dt-* 设计令牌随主题换肤（:root[data-theme]，见 use-theme）
import './styles/reset.css'
import './styles/transition.css'
import './styles/tokens.css'

const { apps, hostName } = useApps()
const { tabs, open, close, activate } = useTabs()
const { theme, toggle: toggleTheme } = useTheme()

const maximized = ref(false)
const viewport = ref<HTMLElement | null>(null)

const activeTab = computed(() => tabs.value.find(tab => tab.active))

/** 资源型 App 不进左侧导航与应用中心（启动直开的嵌入网页，非用户手动发起的入口） */
const launchableApps = computed(() => apps.value.filter(app => app.manifest.kind !== 'resource'))

/** 资源模式：激活 Tab 是资源型 App 时隐藏左侧导航与应用中心（头部保留固定 Tab 条），Web 铺满窗口 */
const resourceMode = computed(() => {
  const tab = activeTab.value
  if (!tab) { return false }
  return apps.value.some(app => app.manifest.id === tab.appId && app.manifest.kind === 'resource')
})

// ---- 窗口控制（顶栏自绘按钮，titleBarStyle: hidden 后为唯一入口） ----
async function minimize(): Promise<void> {
  await window.desktop.window.minimize()
}

async function toggleMaximize(): Promise<void> {
  if (maximized.value) { await window.desktop.window.restore() }
  else { await window.desktop.window.maximize() }
}

async function closeWindow(): Promise<void> {
  await window.desktop.window.close()
}

/** 应用中心：原生浮层窗承载（DOM 无法盖过 WebContentsView），重复调用仅聚焦 */
function openAppCenter(): void {
  void window.desktop.overlay.openAppCenter()
}

// ---- Tab 右键菜单：交由原生浮层窗渲染（页面内容保持可见），坐标为内容区 DIP ----
function openTabContextMenu(tab: DesktopTab, x: number, y: number): void {
  void window.desktop.overlay.openMenu({ tabId: tab.id, appId: tab.appId, x, y })
}

/** 资源模式页面操作入口：顶栏按钮唤出与 Tab 右键同一菜单（刷新/清缓存/清站点数据） */
function openPageMenu(x: number, y: number): void {
  const tab = activeTab.value
  if (!tab) { return }
  void window.desktop.overlay.openMenu({ tabId: tab.id, appId: tab.appId, x, y })
}

// ---- Web App 容器区域：布局变化实时同步给 Main（WebContentsView 跟随定位） ----
function syncWorkArea(): void {
  const el = viewport.value
  if (!el) { return }
  // 窗口隐藏/最小化时测量值塌缩不可信（如 28x0），跳过上报；恢复可见时由 visibilitychange 补报
  if (document.visibilityState !== 'visible') { return }
  const rect = el.getBoundingClientRect()
  const area: WorkAreaRect = {
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  }
  void window.desktop.tabs.setWorkArea(area)
}

/** 窗口从隐藏/最小化恢复后 ResizeObserver 不一定再触发，恢复可见需补报一次 */
function onVisibilityChange(): void {
  if (document.visibilityState === 'visible') { syncWorkArea() }
}

let resizeObserver: ResizeObserver | null = null
let unsubMaximized: (() => void) | null = null

onMounted(() => {
  resizeObserver = new ResizeObserver(syncWorkArea)
  if (viewport.value) { resizeObserver.observe(viewport.value) }
  document.addEventListener('visibilitychange', onVisibilityChange)

  unsubMaximized = window.desktop.events.on('window:maximizedChanged', (value) => {
    maximized.value = value
  })
  void window.desktop.window.isMaximized().then((value) => {
    maximized.value = value
  })
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  document.removeEventListener('visibilitychange', onVisibilityChange)
  unsubMaximized?.()
})
</script>

<template>
  <div class="dt-shell">
    <!-- 单层顶栏：品牌（宿主名）/ 应用中心 / 标签 / 主题 / 窗口控制合一；
         资源模式降级为「品牌 + 窗口控制」（单资源）或「品牌 + 固定 Tab 条 + 窗口控制」（多资源） -->
    <TopBar
      :tabs="tabs"
      :maximized="maximized"
      :theme="theme"
      :resource="resourceMode"
      :host-name="hostName"
      @activate="activate"
      @close="close"
      @context-menu="openTabContextMenu"
      @page-menu="openPageMenu"
      @toggle-theme="toggleTheme"
      @toggle-center="openAppCenter"
      @minimize="minimize"
      @toggle-maximize="toggleMaximize"
      @close-window="closeWindow"
    />
    <div class="dt-body">
      <AppLauncher v-if="!resourceMode" :apps="launchableApps" :tabs="tabs" @open="open" />
      <main class="dt-main">
        <!-- 内容区：即 WebContentsView 对位区域（矩形语义经 getBoundingClientRect 上报） -->
        <div ref="viewport" class="dt-canvas">
          <div v-if="tabs.length === 0" class="dt-empty">
            <p class="dt-empty__title">
              打开一个应用开始工作
            </p>
            <p class="dt-empty__desc">
              从左侧导航或应用中心进入，Ctrl+K 唤起命令面板
            </p>
          </div>
          <div v-else-if="activeTab?.isLoading" class="dt-loading">
            <svg class="dt-loading__spinner" viewBox="0 0 24 24" width="28" height="28">
              <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="44" />
            </svg>
            <p class="dt-loading__text">
              正在加载「{{ activeTab?.title }}」…
            </p>
          </div>
        </div>
        <UpdateBar />
      </main>
    </div>
    <CommandPalette
      :apps="launchableApps"
      :tabs="tabs"
      @open-app="open"
      @activate-tab="activate"
      @toggle-theme="toggleTheme"
      @toggle-center="openAppCenter"
    />
  </div>
</template>

<style scoped>
.dt-shell {
  position: relative;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--dt-bg);
  color: var(--dt-text);
  font-family:
    system-ui,
    -apple-system,
    'Segoe UI',
    'PingFang SC',
    sans-serif;
  transition: background var(--dt-dur-slow) var(--dt-ease);
}

/* 平面布局：侧栏（带右边框）+ 内容区（白底），无间隙无投影 */
.dt-body {
  position: relative;
  z-index: 1;
  flex: 1;
  min-height: 0;
  display: flex;
  min-width: 0;
}

.dt-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--dt-surface);
}

/* 内容区：WebContentsView 以矩形对位（DOM 与原生视图同底色，无边角缝隙） */
.dt-canvas {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: var(--dt-surface);
  transition: background var(--dt-dur-slow) var(--dt-ease);
}

.dt-empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.dt-empty__title {
  font-size: 14px;
  font-weight: 500;
  color: var(--dt-text-3);
  margin: 0 0 6px;
}
.dt-empty__desc {
  font-size: 12px;
  color: var(--dt-text-3);
  opacity: 0.7;
  margin: 0;
}

/* 加载骨架：视图区居中 spinner（Main 侧 dom-ready 前视图零尺寸，骨架屏可见） */
.dt-loading {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
}
.dt-loading__spinner {
  color: var(--dt-brand);
  animation: dt-loading-spin 0.9s linear infinite;
}
.dt-loading__text {
  margin: 0;
  font-size: 13px;
  color: var(--dt-text-3);
}
@keyframes dt-loading-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
