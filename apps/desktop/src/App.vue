<script setup lang="ts">
import type { WorkAreaRect } from '@desktop/shared'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import AppCenter from './components/AppCenter.vue'
import AppLauncher from './components/AppLauncher.vue'
import DownloadsBar from './components/DownloadsBar.vue'
import PermissionRequests from './components/PermissionRequests.vue'
import TabBar from './components/TabBar.vue'
import UpdateBar from './components/UpdateBar.vue'
import { useApps } from './composables/use-apps'
import { useTabs } from './composables/use-tabs'

const { apps } = useApps()
const { tabs, open, close, activate, reload } = useTabs()

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

// ---- Web App 容器区域：布局变化实时同步给 Main（WebContentsView 跟随定位） ----
// 权限横幅等 Shell 元素进入布局时 viewport 自动收缩，ResizeObserver 感知后同步给 Main
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

onMounted(() => {
  resizeObserver = new ResizeObserver(syncWorkArea)
  if (viewport.value)
    resizeObserver.observe(viewport.value)

  unsubMaximized = window.desktop.events.on('window:maximizedChanged', (value) => {
    maximized.value = value
  })
  void window.desktop.window.isMaximized().then((value) => {
    maximized.value = value
  })
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  unsubMaximized?.()
})
</script>

<template>
  <div class="dt-shell">
    <div class="dt-body">
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
      <main class="dt-main">
        <TabBar
          :tabs="tabs"
          :maximized="maximized"
          :app-center-open="appCenterOpen"
          @activate="activate"
          @close="close"
          @reload="reload"
          @toggle-center="appCenterOpen = !appCenterOpen"
          @minimize="minimize"
          @toggle-maximize="toggleMaximize"
          @close-window="closeWindow"
        />
        <div ref="viewport" class="dt-viewport">
          <div v-if="tabs.length === 0" class="dt-empty">
            <p class="dt-empty__title">
              打开一个应用开始工作
            </p>
            <p class="dt-empty__desc">
              从左侧导航或应用中心进入
            </p>
          </div>
        </div>
        <PermissionRequests />
        <DownloadsBar />
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
  background: #f6f7f9;
  color: #1f2328;
  font-family:
    system-ui,
    -apple-system,
    'Segoe UI',
    'PingFang SC',
    sans-serif;
}
.dt-body {
  flex: 1;
  display: flex;
  min-height: 0;
}
.dt-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.dt-viewport {
  position: relative;
  flex: 1;
  background: #f5f6f7;
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
  color: #9ca3af;
  margin: 0 0 6px;
}
.dt-empty__desc {
  font-size: 12px;
  color: #c2c7cf;
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
