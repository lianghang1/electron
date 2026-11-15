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

interface OverlayState {
  kind: OverlayKind
  params: Record<string, string>
  notifications: NotificationItem[]
  downloads: DownloadTask[]
  permission: PermissionView | null
  menu: MenuView | null
  capture: CaptureView | null
  config: string | null
  appCenterOpen: boolean
  updatePrompt: string | null
}

interface AppSummary {
  manifest: { id: string, name: string, version: string, icon?: string }
  source: string
}

const state = ref<OverlayState | null>(null)
const apps = ref<AppSummary[]>([])
const runningIds = ref<string[]>([])
let unsubscribe: (() => void) | undefined

const kind = computed(() => state.value?.kind ?? 'dialog')
const fullscreen = computed(() => kind.value !== 'panel')
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

watch(() => state.value?.permission?.requestId, (id) => {
  clearInterval(countdownTimer)
  if (!id) { return }
  countdown.value = REQUEST_TIMEOUT_S
  countdownTimer = setInterval(() => {
    if (countdown.value > 0) { countdown.value -= 1 }
  }, 1000)
}, { immediate: true })

/**
 * ESC = 拒绝当前请求（超时不持久化语义一致；遮罩/外点不关闭，必须显式决策或等超时）；
 * 应用中心：Esc 关闭、/ 聚焦搜索、↑↓ 选择、Enter 打开
 */
function onOverlayKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && kind.value === 'permission' && state.value?.permission) {
    action('resolve-permission', { requestId: state.value.permission.requestId, granted: false })
    return
  }
  if (kind.value !== 'app-center') { return }
  if (event.key === 'Escape') {
    close()
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

/** 应用清单与运行态按需拉取：浮层窗预热后常驻，不能只在 mounted 拉一次（运行态会过期） */
async function loadApps(): Promise<void> {
  try {
    apps.value = await shell().apps.list() as AppSummary[]
    runningIds.value = await shell().apps.running() as string[]
  }
  catch { apps.value = [] }
}

watch(kind, (next) => {
  if (next === 'command-palette' || next === 'app-center') { void loadApps() }
}, { immediate: true })

/** 应用中心是单例窗口：dismiss 只翻 appCenterOpen 标志（kind 不变），开关都以此为准归零检索态 */
watch(() => state.value?.appCenterOpen, (isOpen) => {
  searchQuery.value = ''
  activeIdx.value = 0
  if (isOpen) { void nextTick(() => searchInput.value?.focus()) }
})

onMounted(async () => {
  // 浮层窗体是透明窗口，全局 body 的 --background 底色会把整窗画出方形底板，浮层页必须透掉
  document.body.style.background = 'transparent'
  window.addEventListener('keydown', onOverlayKeydown)
  // Main 等面板量高后才显示窗口；复用实例高度未变时不会再触发 watch，靠可见性变化补报
  document.addEventListener('visibilitychange', reportHeight)
  state.value = await shell().overlay.sync() as OverlayState
  unsubscribe = shell().overlay.onUpdated((next) => {
    state.value = next as OverlayState
  })
  // panel 的透明区穿透由窗口策略设定，卡片自身经 mouseenter/mouseleave 临时解除
  if (kind.value === 'panel') { shell().overlay.mouseIgnore(true) }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onOverlayKeydown)
  document.removeEventListener('visibilitychange', reportHeight)
  clearInterval(countdownTimer)
  unsubscribe?.()
})

/** 浮层内取消：走 captureDialog.close 清发起方账本并回传空结果，overlay.dismiss 只 hide 窗口不清账 */
function cancelCapture(): void {
  void shell().captureDialog.close()
  close()
}

function action(type: OverlayAction['type'], extra: Omit<OverlayAction, 'kind' | 'type'> = {}): void {
  void shell().overlay.action({ kind: kind.value, type, ...extra })
}

function close(): void {
  void shell().overlay.dismiss(kind.value)
}

async function openApp(appId: string): Promise<void> {
  await shell().apps.open(appId)
  close()
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
 * 面板量高回报：外层留白容器的自然高 = 卡片高 + 上下投影余量（2 × window-system 的 SHADOW 72），
 * Main 据此调整窗口尺寸并锚定右上角；通知在列数由 kernel 上限封顶，面板不内部滚动也不裁剪
 */
const panelRef = ref<HTMLElement | null>(null)

function reportHeight(): void {
  const panel = panelRef.value
  if (!panel || kind.value !== 'panel') { return }
  void shell().overlay.resize(panel.scrollHeight)
}

watch(() => [state.value?.notifications, state.value?.downloads], () => {
  void nextTick(reportHeight)
}, { deep: true, immediate: true })
</script>

<template>
  <div class="relative h-full w-full" :class="fullscreen ? 'flex items-center justify-center' : 'flex flex-col justify-end'">
    <template v-if="kind === 'panel'">
      <div
        ref="panelRef"
        class="flex w-[448px] flex-col p-18"
        @mouseenter="shell().overlay.mouseIgnore(false)"
        @mouseleave="shell().overlay.mouseIgnore(true)"
      >
        <div class="flex w-[304px] flex-col gap-2 rounded-xl bg-popover p-4 shadow-float">
          <div v-if="(state?.notifications?.length ?? 0) > 0" class="flex items-center gap-2">
            <span class="text-ui-base font-semibold text-foreground">通知</span>
            <span class="rounded-full bg-accent px-1.5 py-0.5 text-ui-xs font-medium text-accent-foreground">{{ state?.notifications?.length }}</span>
            <span class="flex-1" />
            <button class="text-ui-xs text-primary hover:underline" @click="clearNotifications">
              全部清除
            </button>
          </div>
          <div
            v-for="task in state?.downloads ?? []"
            :key="task.id"
            class="group relative flex gap-2 rounded-lg p-2 transition-colors hover:bg-hover"
            :title="task.path"
          >
            <span class="mt-0.5 flex size-5 flex-none items-center justify-center rounded-md" :class="task.status === 'completed' ? 'bg-ok/15 text-ok' : 'bg-accent text-accent-foreground'">
              <component :is="task.status === 'completed' ? FileText : Download" :size="11" />
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
              <div v-if="task.status === 'completed'" class="mt-1 flex gap-1">
                <button class="rounded-md px-1.5 py-0.5 text-ui-xs font-medium text-primary transition-colors hover:bg-hover" @click="openDownload(task.id)">
                  打开
                </button>
                <button class="rounded-md px-1.5 py-0.5 text-ui-xs font-medium text-primary transition-colors hover:bg-hover" @click="revealDownload(task.id)">
                  文件夹
                </button>
              </div>
            </div>
            <button class="absolute right-2 top-2 text-foreground-subtle opacity-0 transition-opacity group-hover:opacity-100" aria-label="关闭下载卡" @click="dismissDownload(task.id)">
              <X :size="12" />
            </button>
          </div>
          <div
            v-for="item in state?.notifications ?? []"
            :key="item.id"
            class="group relative flex gap-2 rounded-lg p-2 transition-colors hover:bg-hover"
          >
            <span class="mt-0.5 flex size-5 flex-none items-center justify-center rounded-md" :class="levelChipOf(item.level).class">
              <component :is="levelChipOf(item.level).icon" :size="11" />
            </span>
            <div class="min-w-0 flex-1 pr-4">
              <div class="flex items-baseline gap-2">
                <span class="min-w-0 flex-1 truncate text-ui-caption font-semibold text-foreground">{{ item.title }}</span>
                <span class="flex-none text-ui-xs text-foreground-subtle">{{ relativeTime(item.createdAt) }}</span>
              </div>
              <div v-if="item.appName || item.body" class="mt-0.5 truncate text-ui-xs text-muted-foreground">
                {{ item.appName }}<template v-if="item.appName && item.body">
                  ·
                </template>{{ item.body }}
              </div>
            </div>
            <button class="absolute right-2 top-2 text-foreground-subtle opacity-0 transition-opacity group-hover:opacity-100" aria-label="关闭通知" @click="dismissNotification(item.id)">
              <X :size="12" />
            </button>
          </div>
        </div>
      </div>
    </template>

    <template v-else-if="kind === 'permission' && state?.permission">
      <div class="absolute inset-0 bg-black/30" />
      <div
        :key="state.permission.requestId"
        class="relative w-[400px] rounded-xl border border-t-[3px] border-t-primary bg-popover p-5 shadow-2xl"
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
          <span class="font-medium text-foreground">{{ state.permission.appName ?? state.permission.appId }}</span>
          请求使用「<span class="font-medium text-foreground">{{ permissionLabel(state.permission.permission) }}</span>」，请确认是否允许。
        </div>
        <div class="mt-2 text-ui-xs text-muted-foreground">
          <span class="font-semibold tabular-nums text-primary">{{ countdown }}</span> 秒内未处理将按本次拒绝，不影响下次使用
        </div>
        <div class="mt-5 flex justify-end gap-2">
          <Button variant="outline" @click="action('resolve-permission', { requestId: state.permission.requestId, granted: false })">
            拒绝
          </Button>
          <Button @click="action('resolve-permission', { requestId: state.permission.requestId, granted: true })">
            允许
          </Button>
        </div>
      </div>
    </template>

    <template v-else-if="kind === 'menu' && state?.menu">
      <div class="absolute inset-0" @click="close" />
      <div
        class="absolute w-44 rounded-lg border bg-background p-1 shadow-xl"
        :style="{ left: `${state?.menu?.x}px`, top: `${state?.menu?.y}px` }"
      >
        <button class="w-full rounded px-3 py-2 text-left text-ui-sm hover:bg-muted" @click="action('select-menu', { action: 'activate' })">
          切换到此页
        </button>
        <button class="w-full rounded px-3 py-2 text-left text-ui-sm hover:bg-muted" @click="action('select-menu', { action: 'reload' })">
          重新加载
        </button>
        <button v-if="state?.menu?.closable" class="w-full rounded px-3 py-2 text-left text-ui-sm hover:bg-muted" @click="action('select-menu', { action: 'close-tab' })">
          关闭标签
        </button>
      </div>
    </template>

    <template v-else-if="kind === 'capture' && state?.capture">
      <CaptureDialog
        :key="state.capture.sessionId"
        :session="state.capture"
        @close="cancelCapture"
      />
    </template>

    <template v-else-if="kind === 'settings'">
      <SettingsDialog :open="true" @update:open="close" />
    </template>

    <template v-else-if="kind === 'command-palette'">
      <CommandPalette :open="true" :items="paletteItems" :recent-ids="[]" @select="openApp" @update:open="close" />
    </template>

    <template v-else-if="kind === 'app-center'">
      <div class="flex w-[324px] flex-col rounded-xl bg-popover p-4 shadow-float">
        <div class="flex items-center gap-2">
          <span class="text-ui-base font-semibold text-foreground">应用中心</span>
          <span class="text-ui-xs text-foreground-subtle">{{ apps.length }} 个应用</span>
          <span class="flex-1" />
          <button class="text-muted-foreground transition-colors hover:text-foreground" aria-label="关闭" @click="close">
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
    </template>

    <template v-else-if="kind === 'update-prompt'">
      <div class="w-[420px] rounded-xl border bg-popover p-5 shadow-2xl">
        <div class="text-ui-base font-semibold text-foreground">
          更新已就绪
        </div>
        <div class="mt-2 text-ui-sm text-muted-foreground">
          版本 {{ state?.updatePrompt ?? state?.params.version }} 需要重启后生效。
        </div>
        <div class="mt-5 flex justify-end gap-2">
          <Button variant="outline" @click="close">
            稍后
          </Button>
          <Button @click="shell().shell.relaunch()">
            立即重启
          </Button>
        </div>
      </div>
    </template>

    <template v-else-if="kind === 'config'">
      <div class="w-[420px] rounded-xl border bg-popover p-5 shadow-2xl">
        <div class="text-ui-base font-semibold text-foreground">
          设备配置
        </div>
        <div class="mt-2 text-ui-sm text-muted-foreground">
          类别：{{ state?.config ?? 'devices' }}
        </div>
        <div class="mt-5 flex justify-end">
          <Button variant="outline" @click="close">
            关闭
          </Button>
        </div>
      </div>
    </template>
  </div>
</template>

<style>
/* 浮层窗口页面基座：透明背景 + 无边距（Shell 本体与浮层共用 index.html）。
   浮层窗 transparent:true 依赖页面自身透明——全局 tokens 的 body 底色会把透明窗
   填成不透明色块，整块盖住下层 WebContentsView（master OverlayApp.vue 同款基座） */
html,
body {
  margin: 0;
  padding: 0;
  background: transparent;
  overflow: hidden;
}
</style>
