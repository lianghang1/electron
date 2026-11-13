<script setup lang="ts">
import { desktop } from '@shell/bridge/client'
import { Kbd, Separator } from '@ui/components/ui'
import { Minus, Plus, Search, Settings, Square, X } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import EmptyState from '../apps/pages/EmptyState.vue'
import { resolveEmbeddedRoute } from '../apps/registry'
import CommandPalette from './CommandPalette.vue'
import ForceGate from './ForceGate.vue'

interface ShellTab {
  key: string
  kind: 'embedded' | 'view'
  title: string
  iconColor: string
  route?: string
  instanceId?: string
  appId?: string
}

interface AppSummary {
  manifest: { id: string, name: string, icon?: string, entry: { kind: string, route?: string } }
}

const TAB_COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#06b6d4']
const RECENT_KEY = 'shell.recentAppIds'
const MAX_RECENT = 8

const tabs = ref<ShellTab[]>([])
const activeKey = ref('')
const chrome = ref<'platform' | 'solo'>('platform')
const mode = ref<'desktop' | 'kiosk'>('desktop')
const appList = ref<AppSummary[]>([])
const recentIds = ref<string[]>([])
const contentEl = ref<HTMLElement | null>(null)
const seamEl = ref<HTMLElement | null>(null)
const tabStripEl = ref<HTMLElement | null>(null)
const forceRequiredVersion = ref<string | null>(null)

let offForceRequired: (() => void) | undefined
let offAppOpened: (() => void) | undefined
let offAppClosed: (() => void) | undefined

/** 跨进程载荷不可信：形状不符就忽略，不渲染脏数据 */
function isForceRequired(value: unknown): value is { requiredVersion: string } {
  if (!value || typeof value !== 'object') { return false }
  return typeof (value as Record<string, unknown>).requiredVersion === 'string'
}

const activeTab = computed(() => tabs.value.find(t => t.key === activeKey.value))

/** 多应用态：≥2 个 tab 时顶栏出现 tab 条；单应用态退化为 36px 窗口框（v2 定稿） */
const multiApp = computed(() => tabs.value.length >= 2)

/** 命令面板：⌘K / ＋ / 点击 omnibox 唤起 */
const paletteOpen = ref(false)
const paletteItems = computed(() => appList.value.map(a => ({
  id: a.manifest.id,
  name: a.manifest.name,
  kind: a.manifest.entry.kind === 'embedded' ? '内置' : '网页',
})))

/** 应用在侧边栏的打开态：存在对应 tab 即已打开 */
function tabOfApp(appId: string): ShellTab | undefined {
  return tabs.value.find(t => t.appId === appId)
}

function openSettings() {
  void desktop().overlay.open({ kind: 'settings' })
}

let resizeObserver: ResizeObserver | undefined

function reportRect() {
  // remote 应用时上报接缝视口矩形（原生视图精确落在圆角框内）；其余上报整个内容区
  const el = activeTab.value?.kind === 'view' ? seamEl.value : contentEl.value
  if (!el) { return }
  const r = el.getBoundingClientRect()
  desktop().reportContentRect({ x: r.left, y: r.top, width: r.width, height: r.height })
}

function onResize() {
  reportRect()
  updateTabFade()
}

function activate(tab: ShellTab) {
  activeKey.value = tab.key
  void desktop().apps.activate(tab.instanceId ?? '')
  void nextTick(() => scrollActiveIntoView())
}

function colorFor(appId: string): string {
  let hash = 0
  for (const ch of appId) { hash = (hash * 31 + ch.charCodeAt(0)) >>> 0 }
  return TAB_COLORS[hash % TAB_COLORS.length]!
}

function rememberRecent(appId: string) {
  recentIds.value = [appId, ...recentIds.value.filter(id => id !== appId)].slice(0, MAX_RECENT)
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(recentIds.value))
  }
  catch { /* 隐私模式下 localStorage 不可用：本次会话内仍有效 */ }
}

async function openApp(appId: string) {
  const result = await desktop().apps.open(appId) as { instanceId: string, handle: Record<string, unknown> }
  const manifest = appList.value.find(a => a.manifest.id === appId)?.manifest
  const kind = result.handle.route !== undefined ? 'embedded' : 'view'
  const target = tabs.value.find(t => t.instanceId === result.instanceId)
    ?? tabs.value.find(t => t.appId === appId && t.kind === 'embedded')
  rememberRecent(appId)
  if (target) {
    activate(target)
    return
  }
  const tab: ShellTab = {
    key: result.instanceId,
    kind,
    title: manifest?.name ?? appId,
    iconColor: colorFor(appId),
    route: result.handle.route as string | undefined,
    instanceId: kind === 'view' ? result.instanceId : undefined,
    appId,
  }
  tabs.value.push(tab)
  activate(tab)
}

/** 其他入口（浮层/应用中心）打开应用时同步 tab：以 app.opened 事件为准，本地 open 的重复事件靠 instanceId 去重 */
function ensureTabFromEvent(appId: string, instanceId: string): void {
  const existing = tabs.value.find(t => t.instanceId === instanceId || (t.appId === appId && t.kind === 'embedded'))
  if (existing) {
    if (existing.instanceId !== instanceId) { existing.instanceId = instanceId }
    return
  }
  const manifest = appList.value.find(a => a.manifest.id === appId)?.manifest
  const kind = manifest?.entry.kind === 'embedded' ? 'embedded' : 'view'
  const route = manifest?.entry.route
  const tab: ShellTab = {
    key: instanceId,
    kind,
    title: manifest?.name ?? appId,
    iconColor: colorFor(appId),
    route,
    instanceId: kind === 'view' ? instanceId : undefined,
    appId,
  }
  tabs.value.push(tab)
  void activate(tab)
}

function closeTab(tab: ShellTab) {
  tabs.value = tabs.value.filter(t => t.key !== tab.key)
  if (tab.instanceId) { void desktop().apps.close(tab.instanceId) }
  if (activeKey.value === tab.key) {
    const next = tabs.value[tabs.value.length - 1]
    if (next) {
      activate(next)
    }
    else {
      activeKey.value = ''
      void desktop().apps.activate('')
    }
  }
}

const fadeStart = ref(false)
const fadeEnd = ref(false)

function updateTabFade() {
  const el = tabStripEl.value
  if (!el) {
    fadeStart.value = false
    fadeEnd.value = false
    return
  }
  fadeStart.value = el.scrollLeft > 1
  fadeEnd.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
}

function scrollActiveIntoView() {
  const strip = tabStripEl.value
  const active = strip?.querySelector<HTMLElement>('.tab-active')
  if (strip && active) { active.scrollIntoView({ block: 'nearest', inline: 'nearest' }) }
  updateTabFade()
}

watch(() => tabs.value.length, () => nextTick(updateTabFade))
// 激活 tab 切换 embedded/remote 形态：接缝视口与内容区矩形不同，需重报
watch(activeKey, () => nextTick(reportRect))

const draggingKey = ref<string | null>(null)
const dropTargetKey = ref<string | null>(null)

function onDragStart(e: DragEvent, tab: ShellTab) {
  draggingKey.value = tab.key
  dropTargetKey.value = tab.key
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', tab.key)
  }
}

function onDragOver(e: DragEvent, tab: ShellTab) {
  if (!draggingKey.value || draggingKey.value === tab.key) { return }
  e.preventDefault()
  if (e.dataTransfer) { e.dataTransfer.dropEffect = 'move' }
  dropTargetKey.value = tab.key
}

function onDrop(e: DragEvent, tab: ShellTab) {
  e.preventDefault()
  const from = draggingKey.value
  const to = tab.key
  if (from && from !== to) {
    const arr = [...tabs.value]
    const fromIdx = arr.findIndex(t => t.key === from)
    const toIdx = arr.findIndex(t => t.key === to)
    if (fromIdx >= 0 && toIdx >= 0) {
      const [moved] = arr.splice(fromIdx, 1)
      arr.splice(toIdx, 0, moved!)
      tabs.value = arr
    }
  }
  onDragEnd()
}

function onDragEnd() {
  draggingKey.value = null
  dropTargetKey.value = null
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
  reportRect()
  resizeObserver = new ResizeObserver(reportRect)
  if (contentEl.value) { resizeObserver.observe(contentEl.value) }
  window.addEventListener('resize', onResize)
  window.addEventListener('keydown', onGlobalKeydown)

  offForceRequired = desktop().onEvent('update.force-required', (payload) => {
    if (isForceRequired(payload)) { forceRequiredVersion.value = payload.requiredVersion }
  })
  // 应用打开/关闭全量以事件同步：本地 openApp 与浮层入口共用同一套 tab 状态
  offAppOpened = desktop().onEvent('app.opened', (payload) => {
    const p = payload as { appId?: string, instanceId?: string }
    if (p.appId && p.instanceId) { ensureTabFromEvent(p.appId, p.instanceId) }
  })
  offAppClosed = desktop().onEvent('app.closed', (payload) => {
    const p = payload as { appId?: string, instanceId?: string }
    const tab = tabs.value.find(t => t.instanceId === p.instanceId || t.appId === p.appId)
    if (tab) { closeTab(tab) }
  })

  try {
    recentIds.value = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as string[]
  }
  catch { recentIds.value = [] }

  appList.value = await desktop().apps.list() as AppSummary[]

  const info = await desktop().shell.info()
  chrome.value = info.chrome
  mode.value = info.mode
  if (info.forceUpdate?.blocked) { forceRequiredVersion.value = info.forceUpdate.requiredVersion ?? '' }
  if (info.defaultAppId && appList.value.some(a => a.manifest.id === info.defaultAppId)) { void openApp(info.defaultAppId) }
  await nextTick(updateTabFade)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('resize', onResize)
  window.removeEventListener('keydown', onGlobalKeydown)
  offForceRequired?.()
  offAppOpened?.()
  offAppClosed?.()
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

        <!-- 多应用态：活动带名 tab + 非活动图标 tab + ＋ -->
        <div
          v-if="multiApp"
          ref="tabStripEl"
          class="tab-strip relative flex min-w-0 shrink-0 items-center gap-1 overflow-x-auto"
          :class="{ 'fade-start': fadeStart, 'fade-end': fadeEnd }"
          @scroll="updateTabFade"
        >
          <div
            v-for="tab in tabs"
            :key="tab.key"
            class="tab group flex h-7 shrink-0 cursor-default items-center gap-1.5 rounded-md px-2 text-ui-sm"
            :class="{
              'tab-active bg-accent text-accent-foreground font-medium': tab.key === activeKey,
              'tab-idle opacity-75': tab.key !== activeKey,
              'opacity-40': draggingKey === tab.key,
            }"
            draggable="true"
            @dragstart="onDragStart($event, tab)"
            @dragover="onDragOver($event, tab)"
            @drop="onDrop($event, tab)"
            @dragend="onDragEnd"
          >
            <span class="size-3.5 shrink-0 rounded-sm" :style="{ background: tab.iconColor }" aria-hidden="true" />
            <span
              v-if="tab.key === activeKey"
              class="max-w-32 truncate"
            >{{ tab.title }}</span>
            <span v-else class="sr-only">{{ tab.title }}</span>
            <button class="tab-close" :title="`关闭 ${tab.title}`" aria-label="关闭标签" @click.stop="closeTab(tab)">
              <X :size="11" />
            </button>
          </div>
          <button
            class="tab-plus flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-foreground-subtle transition-colors hover:bg-hover hover:text-foreground"
            title="打开应用（Ctrl+K）"
            aria-label="打开应用"
            @click="paletteOpen = true"
          >
            <Plus :size="14" />
          </button>
        </div>

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
          <button class="ctrl flex h-8 w-10 items-center justify-center rounded-md text-foreground" aria-label="最小化" @click="desktop().window.minimize()">
            <Minus :size="14" />
          </button>
          <button class="ctrl flex h-8 w-10 items-center justify-center rounded-md text-foreground" aria-label="最大化" @click="desktop().window.toggleMaximize()">
            <Square :size="12" />
          </button>
          <button class="ctrl ctrl-close flex h-8 w-10 items-center justify-center rounded-md text-foreground" aria-label="关闭" @click="desktop().window.close()">
            <X :size="14" />
          </button>
        </div>
      </header>

      <header
        v-else-if="mode === 'desktop'"
        class="flex h-chrome-solo items-center border-b border-border bg-glass"
      >
        <span class="titlebar-drag h-full flex-1" />
        <div class="flex h-full items-center">
          <button class="ctrl flex h-full w-11 items-center justify-center text-foreground" aria-label="最小化" @click="desktop().window.minimize()">
            <Minus :size="13" />
          </button>
          <button class="ctrl flex h-full w-11 items-center justify-center text-foreground" aria-label="最大化" @click="desktop().window.toggleMaximize()">
            <Square :size="11" />
          </button>
          <button class="ctrl ctrl-close flex h-full w-11 items-center justify-center text-foreground" aria-label="关闭" @click="desktop().window.close()">
            <X :size="13" />
          </button>
        </div>
      </header>

      <!-- 内容区：全宽。第三方（view）应用渲染在带接缝的圆角视口里，内置应用平铺 -->
      <main ref="contentEl" class="relative min-h-0 flex-1 overflow-hidden" :class="chrome === 'solo' ? 'bg-primary' : ''">
        <template v-if="chrome === 'platform'">
          <div v-if="activeTab && activeTab.kind === 'view'" class="h-full w-full p-1.5">
            <!-- remote 应用：原生 WebContentsView 覆盖到接缝视口矩形（seamEl 上报），此处仅是底板 -->
            <div ref="seamEl" class="h-full w-full overflow-hidden rounded-xl border border-border bg-card" />
          </div>
          <component
            :is="resolveEmbeddedRoute(activeTab.route!)"
            v-else-if="activeTab?.kind === 'embedded' && activeTab.route"
            class="h-full w-full overflow-hidden bg-card"
          />
          <EmptyState v-else class="h-full w-full" />
        </template>
        <template v-else>
          <component
            :is="resolveEmbeddedRoute(activeTab!.route!)"
            v-if="activeTab?.kind === 'embedded' && activeTab.route"
            class="h-full w-full overflow-hidden bg-card"
          />
        </template>
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
.omnibox,
.tab {
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

.tab-strip {
  scrollbar-width: none;
  padding-right: 4px;
}
.tab-strip::-webkit-scrollbar {
  display: none;
}
.tab-strip.fade-start {
  mask-image: linear-gradient(to right, transparent 0, #000 20px, #000 100%);
}
.tab-strip.fade-end {
  mask-image: linear-gradient(to right, #000 0, #000 calc(100% - 20px), transparent 100%);
}
.tab-strip.fade-start.fade-end {
  mask-image: linear-gradient(to right, transparent 0, #000 20px, #000 calc(100% - 20px), transparent 100%);
}

.tab {
  transition: background 0.15s ease, color 0.15s ease, opacity 0.12s ease;
  user-select: none;
}
.tab-idle:hover {
  background: var(--hover);
  opacity: 1;
}
.tab-close {
  display: grid;
  place-items: center;
  color: currentColor;
  border-radius: 4px;
  padding: 1.5px;
  opacity: 0;
  transition: opacity 0.12s ease, background 0.12s ease;
}
.tab:hover .tab-close,
.tab-active .tab-close {
  opacity: 0.65;
}
.tab-close:hover {
  opacity: 1 !important;
  background: var(--hover);
}
.tab-plus {
  transition: background 0.12s ease, color 0.12s ease;
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
