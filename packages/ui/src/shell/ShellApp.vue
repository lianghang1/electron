<script setup lang="ts">
import { desktop } from '@shell/bridge/client'
import { Button, Separator, Tooltip } from '@ui/components/ui'
import { AppWindow, Minus, Plus, Settings, Square, X } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import EmptyState from '../apps/pages/EmptyState.vue'
import { resolveEmbeddedRoute } from '../apps/registry'
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
  manifest: { id: string, name: string, icon?: string, entry: { kind: string } }
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
const tabStripEl = ref<HTMLElement | null>(null)
const forceRequiredVersion = ref<string | null>(null)

let offForceRequired: (() => void) | undefined
let offOverlayClosed: (() => void) | undefined

/** 跨进程载荷不可信：形状不符就忽略，不渲染脏数据 */
function isForceRequired(value: unknown): value is { requiredVersion: string } {
  if (!value || typeof value !== 'object') { return false }
  return typeof (value as Record<string, unknown>).requiredVersion === 'string'
}

const activeTab = computed(() => tabs.value.find(t => t.key === activeKey.value))

// 命令面板与设置走原生浮层窗：WebContentsView 会盖住壳内 DOM 浮层
const paletteOpen = ref(false)

function togglePalette() {
  paletteOpen.value = !paletteOpen.value
  if (paletteOpen.value) { void desktop().overlay.open('command-palette') }
  else { void desktop().overlay.dismiss('command-palette') }
}

function openSettings() {
  void desktop().overlay.open('settings')
}

let resizeObserver: ResizeObserver | undefined

function reportRect() {
  const el = contentEl.value
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
    paletteOpen.value = false
    void desktop().overlay.dismiss('command-palette')
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
  paletteOpen.value = false
  void desktop().overlay.dismiss('command-palette')
  activate(tab)
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

  if (e.key.toLowerCase() === 'k') {
    e.preventDefault()
    togglePalette()
    return
  }
  if (paletteOpen.value) { return }

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
  offOverlayClosed = desktop().onEvent('overlay.closed', (payload) => {
    if ((payload as { kind?: string }).kind === 'command-palette') { paletteOpen.value = false }
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
  offOverlayClosed?.()
})
</script>

<template>
  <div class="shell h-screen w-screen overflow-hidden bg-background">
    <ForceGate v-if="forceRequiredVersion !== null" class="h-full w-full" />
    <div v-else class="shell-window relative flex h-full w-full flex-col rounded-window bg-glass shadow-window backdrop-blur-xl backdrop-saturate-150">
      <header
        v-if="chrome === 'platform'"
        class="flex h-11 items-center gap-2 border-b border-border px-3"
      >
        <div class="titlebar-drag relative flex min-w-0 flex-1 items-center gap-1.5">
          <div
            ref="tabStripEl"
            class="tab-strip relative flex min-w-0 items-center gap-1.5 overflow-x-auto"
            :class="{ 'fade-start': fadeStart, 'fade-end': fadeEnd }"
            @scroll="updateTabFade"
          >
            <div
              v-for="(tab, i) in tabs"
              :key="tab.key"
              class="tab flex h-9 shrink-0 cursor-default items-center gap-2 rounded-md px-2.5 text-ui-base"
              :class="{
                'tab-active bg-card shadow-card': tab.key === activeKey,
                'opacity-40': draggingKey === tab.key,
                'shadow-[inset_2px_0_0_var(--ring)]': dropTargetKey === tab.key && draggingKey !== tab.key,
              }"
              draggable="true"
              role="tab"
              tabindex="0"
              :aria-selected="tab.key === activeKey"
              @click="activate(tab)"
              @keydown.enter="activate(tab)"
              @keydown.space.prevent="activate(tab)"
              @dragstart="onDragStart($event, tab)"
              @dragover="onDragOver($event, tab)"
              @drop="onDrop($event, tab)"
              @dragend="onDragEnd"
            >
              <span
                class="flex size-5 shrink-0 items-center justify-center rounded-md text-white"
                :style="{ background: tab.iconColor }"
              >
                <AppWindow :size="12" :stroke-width="2.4" />
              </span>
              <span class="font-medium text-foreground">{{ tab.title }}</span>
              <span v-if="i < 9" class="tab-index text-ui-xs text-foreground-subtle">{{ i + 1 }}</span>
              <button class="tab-close ml-0.5 opacity-0 hover:opacity-100" aria-label="关闭标签" @click.stop="closeTab(tab)">
                <X :size="12" />
              </button>
            </div>
          </div>
          <Button variant="ghost" size="icon-sm" aria-label="打开应用" @click="togglePalette()">
            <Plus :size="15" />
          </Button>
        </div>
        <span class="shrink-0 text-ui-sm text-foreground-subtle">⌘K</span>
        <Button variant="ghost" size="icon-sm" aria-label="设置" @click="openSettings()">
          <Settings :size="16" />
        </Button>
        <Separator orientation="vertical" class="mx-1 h-4" />
        <div class="flex shrink-0 items-center">
          <button class="ctrl flex h-9 w-11 items-center justify-center text-foreground" aria-label="最小化" @click="desktop().window.minimize()">
            <Minus :size="15" />
          </button>
          <button class="ctrl flex h-9 w-11 items-center justify-center text-foreground" aria-label="最大化" @click="desktop().window.toggleMaximize()">
            <Square :size="13" />
          </button>
          <button class="ctrl ctrl-close flex h-9 w-11 items-center justify-center text-foreground" aria-label="关闭" @click="desktop().window.close()">
            <X :size="15" />
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

      <div class="flex min-h-0 flex-1">
        <nav
          v-if="chrome === 'platform'"
          class="flex w-16 flex-col items-center gap-1.5 border-r border-border py-3"
        >
          <Tooltip v-for="tab in tabs" :key="tab.key" :text="tab.title">
            <button
              class="rail-icon flex size-10 items-center justify-center rounded-icon text-white"
              :class="{ 'rail-icon-active': tab.key === activeKey }"
              :style="{ background: tab.iconColor }"
              @click="activate(tab)"
            >
              <AppWindow :size="19" :stroke-width="2.2" />
            </button>
          </Tooltip>
        </nav>

        <main
          ref="contentEl"
          class="relative min-w-0 flex-1 overflow-hidden"
          :class="[chrome === 'platform' ? 'p-2' : '', chrome === 'solo' ? 'bg-primary' : '']"
        >
          <template v-if="chrome === 'platform'">
            <EmptyState v-if="!activeTab" class="h-full w-full" />
            <component
              :is="resolveEmbeddedRoute(activeTab.route!)"
              v-else-if="activeTab.kind === 'embedded' && activeTab.route"
              class="h-full w-full overflow-hidden rounded-md bg-card"
            />
          </template>
          <template v-else>
            <component
              :is="resolveEmbeddedRoute(activeTab!.route!)"
              v-if="activeTab?.kind === 'embedded' && activeTab.route"
              class="h-full w-full overflow-hidden bg-card"
            />
          </template>
        </main>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 自绘标题栏拖拽：拖拽区全局生效，可点组件必须显式豁免 */
.titlebar-drag {
  -webkit-app-region: drag;
}
.titlebar-drag :deep(button),
.tab {
  -webkit-app-region: no-drag;
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
  transition: background 0.15s ease, box-shadow 0.15s ease, opacity 0.12s ease;
  user-select: none;
}
.tab:hover {
  background: var(--hover);
}
.tab-index {
  font-variant-numeric: tabular-nums;
  opacity: 0;
  transition: opacity 0.12s ease;
}
.tab:hover .tab-index {
  opacity: 0.5;
}
.tab-close {
  color: var(--foreground-subtle);
  border-radius: 6px;
  padding: 2px;
  transition: opacity 0.12s ease, background 0.12s ease;
}
.tab:hover .tab-close,
.tab-active .tab-close {
  opacity: 0.7;
}
.tab-close:hover {
  background: var(--hover);
  opacity: 1 !important;
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

.rail-icon {
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.rail-icon:hover {
  transform: translateY(-1px);
  box-shadow: var(--elevation-card);
}
.rail-icon-active {
  box-shadow:
    0 0 0 2.5px var(--card),
    0 0 0 4px var(--accent),
    0 6px 14px color-mix(in srgb, var(--primary) 28%, transparent);
}
</style>
