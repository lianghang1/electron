<script setup lang="ts">
import type { WorkAreaRect } from '@desktop/shared'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import AppLauncher from './components/AppLauncher.vue'
import TabBar from './components/TabBar.vue'
import { useApps } from './composables/use-apps'
import { useTabs } from './composables/use-tabs'

const { apps } = useApps()
const { tabs, open, close, activate, reload } = useTabs()

const maximized = ref(false)
const viewport = ref<HTMLElement | null>(null)

// ---- 窗口控制 ----
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
    <header class="dt-header">
      <div class="dt-header__brand">
        Desktop
      </div>
      <div class="dt-header__controls">
        <button class="dt-winbtn" title="最小化" @click="minimize">
          ─
        </button>
        <button class="dt-winbtn" :title="maximized ? '还原' : '最大化'" @click="toggleMaximize">
          {{ maximized ? '❐' : '□' }}
        </button>
        <button class="dt-winbtn dt-winbtn--close" title="关闭" @click="closeWindow">
          ✕
        </button>
      </div>
    </header>

    <div class="dt-body">
      <AppLauncher :apps="apps" @open="open" />
      <main class="dt-main">
        <TabBar :tabs="tabs" @activate="activate" @close="close" @reload="reload" />
        <div ref="viewport" class="dt-viewport">
          <div v-if="tabs.length === 0" class="dt-empty">
            从左侧选择一个应用开始
          </div>
        </div>
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
.dt-header {
  height: 40px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #ffffff;
  border-bottom: 1px solid #e5e7eb;
  padding-left: 16px;
}
.dt-header__brand {
  font-size: 13px;
  font-weight: 600;
}
.dt-header__controls {
  display: flex;
  height: 100%;
}
.dt-winbtn {
  width: 40px;
  height: 100%;
  border: none;
  background: transparent;
  font-size: 12px;
  color: #4b5563;
  cursor: pointer;
}
.dt-winbtn:hover {
  background: #f3f4f6;
}
.dt-winbtn--close:hover {
  background: #ef4444;
  color: #ffffff;
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
  background: #eef0f3;
}
.dt-empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9ca3af;
  font-size: 13px;
}
</style>
