<script setup lang="ts">
import type { DesktopTab, WorkAreaRect } from '@desktop/shared'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppCenter from './components/AppCenter.vue'
import AppLauncher from './components/AppLauncher.vue'
import TopBar from './components/TopBar.vue'
import UpdateBar from './components/UpdateBar.vue'
import WindowControls from './components/WindowControls.vue'
import { useApps } from './composables/use-apps'
import { useTabs } from './composables/use-tabs'
import { useTheme } from './composables/use-theme'

const { apps } = useApps()
const { tabs, open, close, activate } = useTabs()
const { theme, toggle: toggleTheme } = useTheme()

const maximized = ref(false)
const viewport = ref<HTMLElement | null>(null)
/** 应用中心面板显隐：flex 成员推开 dt-main，Web 容器经 ResizeObserver 自动跟随 */
const appCenterOpen = ref(false)

const activeTab = computed(() => tabs.value.find(tab => tab.active))

/** 套壳模式：激活 App 声明 chrome: 'single' 时隐藏外壳，Web 铺满窗口；Ctrl+Alt+A 临时唤出 */
const chromeRevealed = ref(false)
const chromeHidden = computed(() => {
  const tab = activeTab.value
  if (!tab)
    return false
  const single = apps.value.some(app => app.manifest.id === tab.appId && app.manifest.chrome === 'single')
  return single && !chromeRevealed.value
})

// 切换激活 Tab 即收回临时唤出的外壳，回到套壳全窗形态
watch(() => activeTab.value?.id, () => {
  chromeRevealed.value = false
})

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

// ---- Tab 右键菜单：交由原生浮层窗渲染（页面内容保持可见），坐标为内容区 DIP ----
function openTabContextMenu(tab: DesktopTab, x: number, y: number): void {
  void window.desktop.overlay.menu({ tabId: tab.id, appId: tab.appId, x, y })
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
let unsubChromeToggle: (() => void) | null = null

onMounted(() => {
  resizeObserver = new ResizeObserver(syncWorkArea)
  if (viewport.value)
    resizeObserver.observe(viewport.value)

  unsubMaximized = window.desktop.events.on('window:maximizedChanged', (value) => {
    maximized.value = value
  })
  // 套壳模式快捷键（Main 侧 before-input-event 拦截后推送）：切换外壳临时显隐
  unsubChromeToggle = window.desktop.events.on('window:toggleChrome', () => {
    chromeRevealed.value = !chromeRevealed.value
  })
  void window.desktop.window.isMaximized().then((value) => {
    maximized.value = value
  })
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  unsubMaximized?.()
  unsubChromeToggle?.()
})
</script>

<template>
  <div class="dt-shell">
    <!-- 套壳模式窄条：窗口无系统标题栏，自绘窗口控制不能随外壳一起隐藏；
         整条为拖拽区，Web 视图区经 ResizeObserver 自动让位到条下方 -->
    <div v-if="chromeHidden" class="dt-chromestrip">
      <WindowControls
        :maximized="maximized"
        @minimize="minimize"
        @toggle-maximize="toggleMaximize"
        @close-window="closeWindow"
      />
    </div>
    <div class="flex flex-1 min-h-0">
      <AppLauncher v-if="!chromeHidden" :apps="apps" :tabs="tabs" @open="open" />
      <Transition name="ac-slide">
        <AppCenter
          v-if="appCenterOpen && !chromeHidden"
          :apps="apps"
          :tabs="tabs"
          @open="open"
          @close="appCenterOpen = false"
        />
      </Transition>
      <main class="flex-1 flex flex-col min-w-0">
        <TopBar
          v-if="!chromeHidden"
          :tabs="tabs"
          :maximized="maximized"
          :app-center-open="appCenterOpen"
          :theme="theme"
          @activate="activate"
          @close="close"
          @context-menu="openTabContextMenu"
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
/* 套壳模式窗口控制窄条：只保留最小化/最大化/关闭，整条可拖动窗口 */
.dt-chromestrip {
  height: 32px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  background: var(--dt-surface);
  border-bottom: 1px solid var(--dt-line);
  -webkit-app-region: drag;
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
