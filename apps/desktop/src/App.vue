<script setup lang="ts">
import type { WorkAreaRect } from '@desktop/shared'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import AppCenter from './components/AppCenter.vue'
import AppLauncher from './components/AppLauncher.vue'
import TopBar from './components/TopBar.vue'
import UpdateBar from './components/UpdateBar.vue'
import { useApps } from './composables/use-apps'
import { useTabs } from './composables/use-tabs'
import { useTheme } from './composables/use-theme'

const { apps } = useApps()
const { tabs, open, close, activate, reload } = useTabs()
const { theme, toggle: toggleTheme } = useTheme()

const maximized = ref(false)
const viewport = ref<HTMLElement | null>(null)
/** 应用中心面板显隐：flex 成员推开 dt-main，Web 容器经 ResizeObserver 自动跟随 */
const appCenterOpen = ref(false)

// ---- 窗口控制（顶栏自绘按钮，titleBarStyle: hidden 后为唯一入口） ----
async function minimize(): Promise<void> {
  await window.desktop.window.minimize()
}

async function toggleMaximize(): Promise<void> {
  if (maximized.value)
    await window.desktop.window.restore()
  else await window.desktop.window.maximize()
}

async function closeWindow(): Promise<void> {
  await window.desktop.window.close()
}

// ---- 缓存清理（浮层菜单发起，作用域为该 Tab 对应的容器） ----
async function cacheClear(appId: string): Promise<void> {
  await window.desktop.cache.clear(appId)
}

async function cacheClearSite(appId: string): Promise<void> {
  await window.desktop.cache.clearSite(appId)
}

// ---- Tab 浮层菜单：渲染进独立透明原生窗（OverlayWindow），
//      原生层级永远压过 WebContentsView，不再受 Shell DOM 层级限制 ----
let menuTarget: { tabId: string, appId: string } | null = null

async function openTabMenu(payload: { tabId: string, appId: string, x: number, y: number }): Promise<void> {
  menuTarget = { tabId: payload.tabId, appId: payload.appId }
  await window.desktop.overlay.showMenu({
    x: payload.x,
    y: payload.y,
    theme: theme.value,
    items: [
      { id: 'reload', label: '刷新页面' },
      { id: 'cache', label: '清理缓存' },
      { id: 'site', label: '清除站点数据（退出登录）', danger: true },
      { id: 'close', label: '关闭标签页', separatorBefore: true },
    ],
  })
}

function onMenuAction(itemId: string): void {
  const target = menuTarget
  menuTarget = null
  if (!target)
    return
  if (itemId === 'reload')
    reload(target.tabId)
  else if (itemId === 'close')
    close(target.tabId)
  else if (itemId === 'cache')
    void cacheClear(target.appId)
  else if (itemId === 'site')
    void cacheClearSite(target.appId)
}

// ---- Web App 容器区域：布局变化实时同步给 Main（WebContentsView 跟随定位） ----
function syncWorkArea(): void {
  const el = viewport.value
  if (!el)
    return
  const rect = el.getBoundingClientRect()
  const area: WorkAreaRect = {
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  }
  void window.desktop.tabs.setWorkArea(area)
}

let resizeObserver: ResizeObserver | null = null
let unsubMaximized: (() => void) | null = null
let unsubMenuAction: (() => void) | null = null

onMounted(() => {
  resizeObserver = new ResizeObserver(syncWorkArea)
  if (viewport.value)
    resizeObserver.observe(viewport.value)

  unsubMaximized = window.desktop.events.on('window:maximizedChanged', (value) => {
    maximized.value = value
  })
  unsubMenuAction = window.desktop.events.on('overlay:menuAction', onMenuAction)
  void window.desktop.window.isMaximized().then((value) => {
    maximized.value = value
  })
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  unsubMaximized?.()
  unsubMenuAction?.()
})
</script>

<template>
  <div class="dt-shell">
    <div class="flex flex-1 min-h-0">
      <AppLauncher :apps="apps" :tabs="tabs" @open="open" />
      <Transition name="ac-slide">
        <AppCenter
          v-if="appCenterOpen"
          :apps="apps"
          :tabs="tabs"
          @open="open"
          @close="appCenterOpen = false"
        />
      </Transition>
      <main class="flex-1 flex flex-col min-w-0">
        <TopBar
          :tabs="tabs"
          :maximized="maximized"
          :app-center-open="appCenterOpen"
          :theme="theme"
          @activate="activate"
          @close="close"
          @tab-menu="openTabMenu"
          @toggle-theme="toggleTheme"
          @toggle-center="appCenterOpen = !appCenterOpen"
          @minimize="minimize"
          @toggle-maximize="toggleMaximize"
          @close-window="closeWindow"
        />
        <div ref="viewport" class="relative flex-1 bg-dt-bg">
          <div v-if="tabs.length === 0" class="dt-empty">
            <p class="dt-empty__title">
              打开一个应用开始工作
            </p>
            <p class="dt-empty__desc">
              从左侧导航或应用中心进入
            </p>
          </div>
        </div>
        <UpdateBar />
      </main>
    </div>
  </div>
</template>

<style scoped>
.dt-shell {
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
  transition: background var(--dt-dur) var(--dt-ease);
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

/* 应用中心面板：推开式出现（flex 成员），淡入 + 轻微左移 */
.ac-slide-enter-active,
.ac-slide-leave-active {
  transition: all 0.2s ease;
}
.ac-slide-enter-from,
.ac-slide-leave-to {
  opacity: 0;
  transform: translateX(-12px);
}
</style>
