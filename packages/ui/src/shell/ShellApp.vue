<script setup lang="ts">
import { shell } from '@shell/bridge/client'
import { Kbd, Separator } from '@ui/components/ui'
import { Minus, Search, Settings, Square, X } from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import EmptyState from '../apps/pages/EmptyState.vue'
import CommandPalette from './CommandPalette.vue'
import ForceGate from './ForceGate.vue'
import ShellTabBar from './ShellTabBar.vue'
import { useShellTabs } from './use-shell-tabs'
import { useViewDock } from './use-view-dock'

const chrome = ref<'platform' | 'solo'>(shell().shell.appearance().chrome)
const mode = ref<'windowed' | 'kiosk'>('windowed')
const forceRequiredVersion = ref<string | null>(null)

const {
  tabs,
  activeKey,
  activeTab,
  recentIds,
  appList,
  activate,
  openApp,
  closeTab,
  moveTab,
  watchAppEvents,
  loadRecent,
  loadApps,
} = useShellTabs()
const { dockEl } = useViewDock()

let offForceRequired: (() => void) | undefined
let offAppEvents: (() => void) | undefined

/** 跨进程载荷不可信：形状不符就忽略，不渲染脏数据 */
function isForceRequired(value: unknown): value is { requiredVersion: string } {
  if (!value || typeof value !== 'object') { return false }
  return typeof (value as Record<string, unknown>).requiredVersion === 'string'
}

/** 多应用态：≥2 个 tab 时顶栏出现 tab 条；单应用态退化为 36px 窗口框（v2 定稿） */
const multiApp = computed(() => tabs.value.length >= 2)

/** solo 档的窗口控制条：仅桌面形态需要，kiosk 全屏锁定无控制条 */
const soloWindowControls = computed(() => chrome.value === 'solo' && mode.value === 'windowed')

/** 命令面板：⌘K / ＋ / 点击 omnibox 唤起 */
const paletteOpen = ref(false)
const paletteItems = computed(() => appList.value.map(a => ({
  id: a.manifest.id,
  name: a.manifest.name,
  kind: a.manifest.entry.kind === 'remote' ? '远程' : '本地',
})))

function openSettings() {
  void shell().overlay.open({ kind: 'settings' })
}

function onGlobalKeydown(e: KeyboardEvent) {
  if (chrome.value !== 'platform') { return }
  const mod = e.ctrlKey || e.metaKey
  if (!mod) { return }

  if (e.key === 'k' || e.key === 'K') {
    e.preventDefault()
    paletteOpen.value = !paletteOpen.value
    return
  }
  if (e.key === 'Tab' && tabs.value.length > 1) {
    e.preventDefault()
    const idx = tabs.value.findIndex(t => t.key === activeKey.value)
    const step = e.shiftKey ? -1 : 1
    const next = (idx + step + tabs.value.length) % tabs.value.length
    activate(tabs.value[next]!)
    return
  }
  if (/^[1-9]$/.test(e.key)) {
    const tab = tabs.value[Number(e.key) - 1]
    if (tab) {
      e.preventDefault()
      activate(tab)
    }
  }
}

onMounted(async () => {
  window.addEventListener('keydown', onGlobalKeydown)
  offAppEvents = watchAppEvents()
  offForceRequired = shell().onEvent('update.force-required', (payload) => {
    if (isForceRequired(payload)) { forceRequiredVersion.value = payload.requiredVersion }
  })
  loadRecent()
  await loadApps()
  const info = await shell().shell.info()
  mode.value = info.mode
  if (info.forceUpdate?.blocked) { forceRequiredVersion.value = info.forceUpdate.requiredVersion ?? '' }
  if (info.defaultAppId && appList.value.some(a => a.manifest.id === info.defaultAppId)) { void openApp(info.defaultAppId) }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
  offForceRequired?.()
  offAppEvents?.()
})
</script>

<template>
  <div class="shell h-screen w-screen overflow-hidden bg-background">
    <ForceGate v-if="forceRequiredVersion !== null" class="h-full w-full" />
    <div v-else class="shell-window relative flex h-full w-full flex-col rounded-window bg-glass shadow-window backdrop-blur-xl backdrop-saturate-150">
      <!-- 平台档：自适应标题栏。单应用 = 36px 窗口框；多应用 = logo + 图标化 tabs + omnibox -->
      <header
        v-if="chrome === 'platform'"
        class="titlebar-drag flex h-9 items-center gap-1.5 border-b border-border px-2.5"
      >
        <!-- 品牌标（壳不显示名称） -->
        <svg class="brand-mark shrink-0" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="currentColor" d="M6 6h15l14 14h6L27 6h15v36H6Z" />
        </svg>

        <ShellTabBar
          v-if="multiApp"
          :tabs="tabs"
          :active-key="activeKey"
          @activate="activate"
          @close="closeTab"
          @move="moveTab"
          @open-palette="paletteOpen = true"
        />

        <!-- 单应用态：当前应用名直接跟在 logo 后（窗口框语义，不做导航） -->
        <span v-else-if="activeTab" class="truncate text-ui-sm font-medium text-foreground">
          {{ activeTab.title }}
        </span>

        <!-- omnibox：两侧弹性占位让它视觉居中，剩余空白仍是拖拽区 -->
        <div class="titlebar-drag min-w-3 flex-1" />
        <button
          class="omnibox flex h-6.5 w-72 items-center gap-2 rounded-full bg-surface-hover px-3 text-left text-ui-sm text-foreground-subtle transition-colors hover:bg-hover"
          title="搜索、跳转或执行命令（Ctrl+K）"
          @click="paletteOpen = true"
        >
          <Search :size="12" class="shrink-0" />
          <span class="flex-1 truncate">搜索、跳转或执行命令</span>
          <Kbd>Ctrl K</Kbd>
        </button>
        <div class="titlebar-drag min-w-3 flex-1" />

        <div class="flex shrink-0 items-center">
          <button class="ctrl flex h-8 w-9 items-center justify-center rounded-md text-foreground" aria-label="设置" @click="openSettings()">
            <Settings :size="15" />
          </button>
          <Separator orientation="vertical" class="mx-1 h-4" />
          <button class="ctrl flex h-8 w-10 items-center justify-center rounded-md text-foreground" aria-label="最小化" @click="shell().window.minimize()">
            <Minus :size="14" />
          </button>
          <button class="ctrl flex h-8 w-10 items-center justify-center rounded-md text-foreground" aria-label="最大化" @click="shell().window.toggleMaximize()">
            <Square :size="12" />
          </button>
          <button class="ctrl ctrl-close flex h-8 w-10 items-center justify-center rounded-md text-foreground" aria-label="关闭" @click="shell().window.close()">
            <X :size="14" />
          </button>
        </div>
      </header>

      <header
        v-else-if="soloWindowControls"
        class="flex h-chrome-solo items-center border-b border-border bg-glass"
      >
        <span class="titlebar-drag h-full flex-1" />
        <div class="flex h-full items-center">
          <button class="ctrl flex h-full w-11 items-center justify-center text-foreground" aria-label="最小化" @click="shell().window.minimize()">
            <Minus :size="13" />
          </button>
          <button class="ctrl flex h-full w-11 items-center justify-center text-foreground" aria-label="最大化" @click="shell().window.toggleMaximize()">
            <Square :size="11" />
          </button>
          <button class="ctrl ctrl-close flex h-full w-11 items-center justify-center text-foreground" aria-label="关闭" @click="shell().window.close()">
            <X :size="13" />
          </button>
        </div>
      </header>

      <!-- 内容区：视图底板恒存在，solo 铺满无边框 / platform 接缝圆角；落位上报只认 dockEl -->
      <main class="relative min-h-0 flex-1 overflow-hidden" :class="chrome === 'solo' ? 'bg-primary' : ''">
        <div class="h-full w-full overflow-hidden" :class="chrome === 'platform' ? 'p-1.5' : ''">
          <div
            ref="dockEl"
            class="h-full w-full overflow-hidden"
            :class="chrome === 'platform' ? 'rounded-xl border border-border bg-card' : ''"
          />
        </div>
        <EmptyState v-if="chrome === 'platform' && !activeTab" class="absolute inset-0" />
      </main>

      <CommandPalette
        v-if="chrome === 'platform'"
        v-model:open="paletteOpen"
        :items="paletteItems"
        :recent-ids="recentIds"
        @select="id => void openApp(id)"
      />
    </div>
  </div>
</template>

<style scoped>
/* 自绘标题栏拖拽：整条标题栏都是拖拽区，可点组件必须显式豁免 */
.titlebar-drag {
  -webkit-app-region: drag;
}
.titlebar-drag :deep(button),
.titlebar-drag button,
.titlebar-drag input,
.omnibox {
  -webkit-app-region: no-drag;
}

.brand-mark {
  width: 17px;
  height: 17px;
  color: var(--ring);
}

.omnibox {
  transition: background 0.15s ease;
  user-select: none;
}

.ctrl {
  transition: background 0.12s ease;
}
.ctrl:hover {
  background: var(--hover);
}
.ctrl-close:hover {
  background: var(--destructive) !important;
  color: var(--destructive-foreground) !important;
}
</style>
