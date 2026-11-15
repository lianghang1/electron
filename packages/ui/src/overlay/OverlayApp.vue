<script setup lang="ts">
import type { DownloadTask } from '@shell/shared'
import type { OverlayAction, OverlayKind } from '@shell/shared/ipc'
import type { Component } from 'vue'
import { shell } from '@shell/bridge/client'
import { formatBytes, permissionLabel } from '@shell/shared'
import { Button, Kbd } from '@ui/components/ui'
import { AlertCircle, AlertTriangle, Bell, Check, Download, FileText, Search, X } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import CaptureDialog from '../capture/CaptureDialog.vue'
import CommandPalette from '../shell/CommandPalette.vue'
import SettingsDialog from '../shell/SettingsDialog.vue'
import { colorFor } from '../shell/use-shell-tabs'

interface NotificationItem {
  id: string
  title: string
  body?: string
  appName?: string
  level: string
  /** kernel 推送的创建时点：面板按它渲染相对时间 */
  createdAt?: number
  ttlMs: number
}

interface PermissionView {
  requestId: string
  appId: string
  appName?: string
  permission: string
  origin: string
}

interface MenuView {
  id: string
  tabId: string
  appId: string
  x: number
  y: number
  closable: boolean
}

interface CaptureView {
  sessionId: string
  title: string
  appId: string
  appName: string
  deviceId?: string
  deviceLabel?: string
  resolutionNum?: number
  maxCount?: number
}

interface PlaneState {
  notifications: NotificationItem[]
  downloads: DownloadTask[]
  permission: PermissionView | null
  menu: MenuView | null
  appCenterOpen: boolean
  paletteOpen: boolean
  updatePrompt: string | null
  config: string | null
}

interface OverlayState {
  kind: 'plane' | OverlayKind
  params: Record<string, string>
  plane: PlaneState | null
  capture: CaptureView | null
}

interface AppSummary {
  manifest: { id: string, name: string, version: string, icon?: string }
  source: string
}

const state = ref<OverlayState | null>(null)
const apps = ref<AppSummary[]>([])
const runningIds = ref<string[]>([])
let unsubscribe: (() => void) | undefined

/** plane 页面自身的 kind 恒为 'plane'（载体的身份），表面切换全在 plane 快照内 */
const kind = computed(() => state.value?.kind ?? 'plane')
const plane = computed(() => (state.value?.kind === 'plane' ? state.value.plane : null))
const permission = computed(() => plane.value?.permission ?? null)
/** 交互表面在列 = plane 要收全量鼠标（遮罩外点关闭、卡片交互），toast 独占时才穿透 */
const interactiveOpen = computed(() => Boolean(
  plane.value && (plane.value.permission || plane.value.menu || plane.value.appCenterOpen
    || plane.value.paletteOpen || plane.value.updatePrompt || plane.value.config),
))
const paletteItems = computed(() => apps.value.map(a => ({ id: a.manifest.id, name: a.manifest.name, kind: 'app' })))

/** 应用中心检索态：/ 聚焦、↑↓ 选择、Enter 打开；过滤按名称与 appId */
const searchQuery = ref('')
const searchInput = ref<HTMLInputElement | null>(null)
const activeIdx = ref(0)

const filteredApps = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) { return apps.value }
  return apps.value.filter(a =>
    a.manifest.name.toLowerCase().includes(q) || a.manifest.id.toLowerCase().includes(q))
})

watch(searchQuery, () => { activeIdx.value = 0 })

/** 授权卡倒计时：与 Main 的 30s 超时同源，归零由 Main 按拒绝收尾（master 同款语义） */
const REQUEST_TIMEOUT_S = 30
const countdown = ref(REQUEST_TIMEOUT_S)
let countdownTimer: ReturnType<typeof setInterval> | undefined

watch(() => plane.value?.permission?.requestId, (id) => {
  clearInterval(countdownTimer)
  if (!id) { return }
  countdown.value = REQUEST_TIMEOUT_S
  countdownTimer = setInterval(() => {
    if (countdown.value > 0) { countdown.value -= 1 }
  }, 1000)
}, { immediate: true })

/**
 * plane 无独立窗口焦点，交互表面在列时 Main 已把窗内焦点交给 plane，keydown 才能抵达：
 * 权限 ESC = 拒绝当前请求（超时不持久化语义一致；遮罩/外点不关闭，必须显式决策或等超时）；
 * 应用中心：Esc 关闭、/ 聚焦搜索、↑↓ 选择、Enter 打开
 */
function onPlaneKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && plane.value?.permission) {
    action('resolve-permission', { requestId: plane.value.permission.requestId, granted: false })
    return
  }
  if (!plane.value?.appCenterOpen) { return }
  if (event.key === 'Escape') {
    close('app-center')
    return
  }
  if (event.key === '/' && document.activeElement !== searchInput.value) {
    event.preventDefault()
    searchInput.value?.focus()
    return
  }
  if (!filteredApps.value.length) { return }
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    activeIdx.value = Math.min(activeIdx.value + 1, filteredApps.value.length - 1)
  }
  else if (event.key === 'ArrowUp') {
    event.preventDefault()
    activeIdx.value = Math.max(activeIdx.value - 1, 0)
  }
  else if (event.key === 'Enter') {
    const target = filteredApps.value[activeIdx.value]
    if (target) { void openApp(target.manifest.id) }
  }
}

/** 应用清单与运行态按需拉取：plane 常驻，不能只在 mounted 拉一次（运行态会过期） */
async function loadApps(): Promise<void> {
  try {
    apps.value = await shell().apps.list() as AppSummary[]
    runningIds.value = await shell().apps.running() as string[]
  }
  catch { apps.value = [] }
}

watch(() => [plane.value?.paletteOpen, plane.value?.appCenterOpen], ([palette, center]) => {
  if (palette || center) { void loadApps() }
})

/** 应用中心开关都以此为准归零检索态 */
watch(() => plane.value?.appCenterOpen, (isOpen) => {
  searchQuery.value = ''
  activeIdx.value = 0
  if (isOpen) { void nextTick(() => searchInput.value?.focus()) }
})

onMounted(async () => {
  // plane 是透明视图，全局 body 的 --background 底色会把整面画出方形底板，浮层页必须透掉
  document.body.style.background = 'transparent'
  window.addEventListener('keydown', onPlaneKeydown)
  state.value = await shell().overlay.sync() as OverlayState
  unsubscribe = shell().overlay.onUpdated((next) => {
    state.value = next as OverlayState
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onPlaneKeydown)
  clearInterval(countdownTimer)
  unsubscribe?.()
})

/** 浮层内取消：走 captureDialog.close 清发起方账本并回传空结果，overlay.dismiss 只收场不清账 */
function cancelCapture(): void {
  void shell().captureDialog.close()
  close('capture')
}

function action(type: OverlayAction['type'], extra: Omit<OverlayAction, 'kind' | 'type'> = {}): void {
  void shell().overlay.action({ kind: actionKind(type), type, ...extra })
}

/** 动作寻址：权限结论发给 permission 表面，其余按当前打开的表面归位 */
function actionKind(type: OverlayAction['type']): OverlayKind {
  if (type === 'resolve-permission') { return 'permission' }
  if (type === 'select-menu') { return 'menu' }
  if (type === 'close-capture') { return 'capture' }
  return 'app-center'
}

function close(kindArg: OverlayKind): void {
  void shell().overlay.dismiss(kindArg)
}

async function openApp(appId: string): Promise<void> {
  await shell().apps.open(appId)
  close('app-center')
}

function dismissNotification(id: string): void {
  void shell().notifications.dismiss(id)
}

function clearNotifications(): void {
  void shell().notifications.clear()
}

function dismissDownload(taskId: string): void {
  void shell().downloads.dismiss(taskId)
}

async function openDownload(taskId: string): Promise<void> {
  await shell().downloads.open(taskId)
}

function revealDownload(taskId: string): void {
  void shell().downloads.reveal(taskId)
}

/** 下载卡中文状态（master STATUS_TEXT 语义） */
const statusText: Record<string, string> = {
  progressing: '下载中',
  completed: '已完成',
  cancelled: '已取消',
  interrupted: '已中断',
  failed: '已失败',
}

/** 通知级别章：软色底 + 语义图标，未识别级别回退 info */
const chipInfo = { icon: Bell, class: 'bg-accent text-accent-foreground' } as const
const levelChip: Record<string, { icon: Component, class: string }> = {
  info: chipInfo,
  success: { icon: Check, class: 'bg-ok/15 text-ok' },
  warning: { icon: AlertTriangle, class: 'bg-warn/15 text-warn' },
  error: { icon: AlertCircle, class: 'bg-destructive/15 text-destructive' },
}

function levelChipOf(level: string): { icon: Component, class: string } {
  return levelChip[level] ?? chipInfo
}

/** 相对时间：一分钟内「刚刚」，一小时内按分钟，更早退回 HH:mm */
function relativeTime(ts?: number): string {
  if (!ts) { return '' }
  const diff = Date.now() - ts
  if (diff < 60_000) { return '刚刚' }
  if (diff < 3_600_000) { return `${Math.floor(diff / 60_000)} 分钟前` }
  return new Date(ts).toTimeString().slice(0, 5)
}

/**
 * toast 独占时 plane 整面穿透（WebContentsView 无逐像素命中），卡片悬停临时拦截，
 * 离开即交还；交互表面在列时 plane 本就收全量鼠标，悬停切换是空操作
 */
function cardHover(hovering: boolean): void {
  if (!interactiveOpen.value) { shell().overlay.mouseIgnore(!hovering) }
}
</script>

<template>
  <div class="relative h-full w-full">
    <!-- 独立浮层窗：拍摄会话 -->
    <template v-if="kind === 'capture' && state?.capture">
      <CaptureDialog
        :key="state.capture.sessionId"
        :session="state.capture"
        @close="cancelCapture"
      />
    </template>

    <!-- 独立浮层窗：设置 -->
    <template v-else-if="kind === 'settings'">
      <SettingsDialog :open="true" @update:open="close('settings')" />
    </template>

    <!-- 通知平面：toast 堆叠 + 交互表面，全部平面内渲染 -->
    <template v-else-if="kind === 'plane' && plane">
      <!-- 通知/下载 toast 堆叠：右上角顶栏之下，kernel 上限封顶，不内部滚动 -->
      <TransitionGroup
        v-if="plane.notifications.length || plane.downloads.length"
        tag="div"
        name="plane-toast"
        class="pointer-events-none absolute right-4 top-13 z-10 flex w-80 flex-col gap-2"
      >
        <div
          v-for="task in plane.downloads"
          :key="task.id"
          class="group pointer-events-auto flex gap-2 rounded-xl bg-popover p-3 shadow-float"
          :title="task.path"
          @mouseenter="cardHover(true)"
          @mouseleave="cardHover(false)"
        >
          <span class="mt-0.5 flex size-6 flex-none items-center justify-center rounded-lg" :class="task.status === 'completed' ? 'bg-ok/15 text-ok' : 'bg-accent text-accent-foreground'">
            <component :is="task.status === 'completed' ? FileText : Download" :size="13" />
          </span>
          <div class="min-w-0 flex-1">
            <div class="flex items-baseline gap-2 pr-4">
              <span class="min-w-0 flex-1 truncate text-ui-caption font-semibold text-foreground">{{ task.filename }}</span>
              <span class="flex-none text-ui-xs text-foreground-subtle">
                {{ statusText[task.status] ?? task.status }}<template v-if="task.status === 'progressing' && task.percent >= 0"> · {{ task.percent }}%</template><template v-if="task.total > 0"> · {{ formatBytes(task.total) }}</template>
              </span>
            </div>
            <div
              v-if="task.status === 'progressing' && task.percent >= 0"
              class="mt-1.5 h-0.5 overflow-hidden rounded-full bg-hover"
            >
              <div class="h-full rounded-full bg-primary transition-[width] duration-200" :style="{ width: `${task.percent}%` }" />
            </div>
            <div v-if="task.status === 'completed'" class="mt-1.5 flex gap-1">
              <button class="rounded-md px-1.5 py-0.5 text-ui-xs font-medium text-primary transition-colors hover:bg-hover" @click="openDownload(task.id)">
                打开
              </button>
              <button class="rounded-md px-1.5 py-0.5 text-ui-xs font-medium text-primary transition-colors hover:bg-hover" @click="revealDownload(task.id)">
                文件夹
              </button>
            </div>
          </div>
          <button class="absolute right-2 top-2 text-foreground-subtle opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-100" aria-label="关闭下载卡" @click="dismissDownload(task.id)">
            <X :size="12" />
          </button>
        </div>
        <div
          v-for="item in plane.notifications"
          :key="item.id"
          class="pointer-events-auto group flex gap-2 rounded-xl bg-popover p-3 shadow-float"
          @mouseenter="cardHover(true)"
          @mouseleave="cardHover(false)"
        >
          <span class="mt-0.5 flex size-6 flex-none items-center justify-center rounded-lg" :class="levelChipOf(item.level).class">
            <component :is="levelChipOf(item.level).icon" :size="13" />
          </span>
          <div class="min-w-0 flex-1 pr-4">
            <div class="flex items-baseline gap-2">
              <span class="min-w-0 flex-1 truncate text-ui-caption font-semibold text-foreground">{{ item.title }}</span>
              <span class="flex-none text-ui-xs text-foreground-subtle">{{ relativeTime(item.createdAt) }}</span>
            </div>
            <div v-if="item.appName || item.body" class="mt-0.5 line-clamp-2 text-ui-xs text-muted-foreground">
              {{ item.appName }}<template v-if="item.appName && item.body">
                ·
              </template>{{ item.body }}
            </div>
          </div>
          <button class="absolute right-2 top-2 text-foreground-subtle opacity-0 transition-opacity group-hover:opacity-100" aria-label="关闭通知" @click="dismissNotification(item.id)">
            <X :size="12" />
          </button>
        </div>
        <div
          v-if="plane.notifications.length > 1"
          key="clear-all"
          class="pointer-events-auto flex justify-end"
          @mouseenter="cardHover(true)"
          @mouseleave="cardHover(false)"
        >
          <button class="rounded-md bg-popover px-2 py-1 text-ui-xs font-medium text-primary shadow-float transition-colors hover:bg-hover" @click="clearNotifications">
            全部清除
          </button>
        </div>
      </TransitionGroup>

      <!-- 权限请求：居中大卡 + 遮罩 + 倒计时条；外点不关闭，必须显式决策或 ESC 拒绝 -->
      <Transition name="plane-fade">
        <div v-if="permission" class="absolute inset-0 z-20 flex items-center justify-center bg-black/30">
          <div
            :key="permission.requestId"
            class="w-[400px] rounded-xl bg-popover p-5 shadow-float"
          >
            <div class="flex items-center gap-2">
              <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
              </span>
              <div class="text-ui-base font-semibold text-foreground">
                权限请求
              </div>
            </div>
            <div class="mt-2 text-ui-sm leading-relaxed text-muted-foreground">
              <span class="font-medium text-foreground">{{ permission.appName ?? permission.appId }}</span>
              请求使用「<span class="font-medium text-foreground">{{ permissionLabel(permission.permission) }}</span>」，请确认是否允许。
            </div>
            <div class="mt-3">
              <div class="flex items-baseline justify-between text-ui-xs text-muted-foreground">
                <span><span class="font-semibold tabular-nums text-primary">{{ countdown }}</span> 秒内未处理将按本次拒绝</span>
                <span class="tabular-nums text-foreground-subtle">{{ countdown }}s</span>
              </div>
              <div class="mt-1 h-0.5 overflow-hidden rounded-full bg-hover">
                <div class="h-full rounded-full bg-primary transition-[width] duration-1000 ease-linear" :style="{ width: `${(countdown / REQUEST_TIMEOUT_S) * 100}%` }" />
              </div>
            </div>
            <div class="mt-4 flex justify-end gap-2">
              <Button variant="outline" @click="action('resolve-permission', { requestId: permission.requestId, granted: false })">
                拒绝
              </Button>
              <Button @click="action('resolve-permission', { requestId: permission.requestId, granted: true })">
                允许
              </Button>
            </div>
          </div>
        </div>
      </Transition>

      <!-- 页签菜单：锚点由发起方给出，遮罩外点关闭 -->
      <Transition name="plane-fade">
        <div v-if="plane.menu" class="absolute inset-0 z-20" @click.self="close('menu')">
          <div
            class="absolute w-44 rounded-xl bg-popover p-1 shadow-float"
            :style="{ left: `${plane.menu.x}px`, top: `${plane.menu.y}px` }"
          >
            <button class="w-full rounded-lg px-3 py-2 text-left text-ui-sm text-foreground transition-colors hover:bg-hover" @click="action('select-menu', { action: 'activate' })">
              切换到此页
            </button>
            <button class="w-full rounded-lg px-3 py-2 text-left text-ui-sm text-foreground transition-colors hover:bg-hover" @click="action('select-menu', { action: 'reload' })">
              重新加载
            </button>
            <button v-if="plane.menu.closable" class="w-full rounded-lg px-3 py-2 text-left text-ui-sm text-foreground transition-colors hover:bg-hover" @click="action('select-menu', { action: 'close-tab' })">
              关闭标签
            </button>
          </div>
        </div>
      </Transition>

      <!-- 应用中心：居中浮层，遮罩外点关闭 -->
      <Transition name="plane-fade">
        <div v-if="plane.appCenterOpen" class="absolute inset-0 z-20 flex items-center justify-center" @click.self="close('app-center')">
          <div class="flex w-[324px] flex-col rounded-xl bg-popover p-4 shadow-float">
            <div class="flex items-center gap-2">
              <span class="text-ui-base font-semibold text-foreground">应用中心</span>
              <span class="text-ui-xs text-foreground-subtle">{{ apps.length }} 个应用</span>
              <span class="flex-1" />
              <button class="text-muted-foreground transition-colors hover:text-foreground" aria-label="关闭" @click="close('app-center')">
                <X :size="14" />
              </button>
            </div>
            <div class="mt-3 flex items-center gap-2 rounded-lg bg-muted px-3 py-1.5">
              <Search :size="13" class="flex-none text-foreground-subtle" />
              <input
                ref="searchInput"
                v-model="searchQuery"
                type="text"
                placeholder="搜索应用…"
                class="h-6 w-full min-w-0 bg-transparent text-ui-sm text-foreground outline-none placeholder:text-foreground-subtle"
              >
              <Kbd v-if="!searchQuery" class="flex-none">
                /
              </Kbd>
            </div>
            <div v-if="filteredApps.length" class="mt-3 grid grid-cols-3 gap-1">
              <button
                v-for="(app, i) in filteredApps"
                :key="app.manifest.id"
                class="flex flex-col items-center gap-2 rounded-lg px-1 py-3 transition-colors hover:bg-hover"
                :class="i === activeIdx ? 'bg-hover' : ''"
                :title="`打开 ${app.manifest.name}`"
                @click="openApp(app.manifest.id)"
              >
                <span class="relative grid size-11 flex-none place-items-center rounded-icon" :style="{ background: colorFor(app.manifest.id) }" aria-hidden="true">
                  <img v-if="app.manifest.icon" :src="app.manifest.icon" alt="" class="absolute inset-0 size-full rounded-icon object-cover">
                  <span v-else class="text-ui-lg font-semibold text-white">{{ app.manifest.name.slice(0, 1) }}</span>
                  <span v-if="runningIds.includes(app.manifest.id)" class="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-ok ring-2 ring-popover" />
                </span>
                <span class="max-w-full truncate text-ui-sm text-foreground">{{ app.manifest.name }}</span>
              </button>
            </div>
            <div v-else class="px-2 py-6 text-center text-ui-sm text-muted-foreground">
              {{ apps.length ? '无匹配应用' : '暂无已注册应用' }}
            </div>
            <div class="mt-3 text-center text-ui-xs text-foreground-subtle">
              Enter 打开 · Esc 关闭 · ⌘K 命令面板
            </div>
          </div>
        </div>
      </Transition>

      <!-- 命令面板：omnibox 锚定下拉，自带遮罩与外点关闭 -->
      <CommandPalette
        :open="Boolean(plane.paletteOpen)"
        :items="paletteItems"
        :recent-ids="[]"
        @select="openApp"
        @update:open="close('command-palette')"
      />

      <!-- 更新提示：居中卡片 -->
      <Transition name="plane-fade">
        <div v-if="plane.updatePrompt" class="absolute inset-0 z-20 flex items-center justify-center" @click.self="close('update-prompt')">
          <div class="w-[420px] rounded-xl bg-popover p-5 shadow-float">
            <div class="text-ui-base font-semibold text-foreground">
              更新已就绪
            </div>
            <div class="mt-2 text-ui-sm text-muted-foreground">
              版本 {{ plane.updatePrompt }} 需要重启后生效。
            </div>
            <div class="mt-5 flex justify-end gap-2">
              <Button variant="outline" @click="close('update-prompt')">
                稍后
              </Button>
              <Button @click="shell().shell.relaunch()">
                立即重启
              </Button>
            </div>
          </div>
        </div>
      </Transition>

      <!-- 设备配置：居中卡片（JSAPI overlay.openConfig 的落点） -->
      <Transition name="plane-fade">
        <div v-if="plane.config" class="absolute inset-0 z-20 flex items-center justify-center" @click.self="close('config')">
          <div class="w-[420px] rounded-xl bg-popover p-5 shadow-float">
            <div class="text-ui-base font-semibold text-foreground">
              设备配置
            </div>
            <div class="mt-2 text-ui-sm text-muted-foreground">
              类别：{{ plane.config }}
            </div>
            <div class="mt-5 flex justify-end">
              <Button variant="outline" @click="close('config')">
                关闭
              </Button>
            </div>
          </div>
        </div>
      </Transition>
    </template>
  </div>
</template>

<style>
/* 浮层页面基座：透明背景 + 无边距（Shell 本体与浮层共用 index.html）。
   透明载体依赖页面自身透明——全局 tokens 的 body 底色会把透明面
   填成不透明色块，整块盖住下层内容（master OverlayApp.vue 同款基座） */
html,
body {
  margin: 0;
  padding: 0;
  background: transparent;
  overflow: hidden;
}

/* plane 内进出场：纯 CSS 过渡，显隐零握手 */
.plane-toast-enter-active,
.plane-toast-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.plane-toast-enter-from,
.plane-toast-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
.plane-toast-move {
  transition: transform 0.18s ease;
}
.plane-fade-enter-active,
.plane-fade-leave-active {
  transition: opacity 0.16s ease;
}
.plane-fade-enter-from,
.plane-fade-leave-to {
  opacity: 0;
}
</style>
