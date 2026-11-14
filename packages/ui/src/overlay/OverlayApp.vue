<script setup lang="ts">
import type { DownloadTask } from '@shell/shared'
import type { OverlayAction, OverlayKind } from '@shell/shared/ipc'
import { shell } from '@shell/bridge/client'
import { formatBytes, permissionLabel } from '@shell/shared'
import { Button } from '@ui/components/ui'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import CommandPalette from '../shell/CommandPalette.vue'
import SettingsDialog from '../shell/SettingsDialog.vue'

interface NotificationItem {
  id: string
  title: string
  body?: string
  appName?: string
  level: string
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

interface AppSummary { manifest: { id: string, name: string } }

const state = ref<OverlayState | null>(null)
const apps = ref<AppSummary[]>([])
const frame = ref('')
const shots = ref<{ imagePath: string, thumbDataUrl?: string }[]>([])
const busy = ref(false)
let unsubscribe: (() => void) | undefined
let offFrame: (() => void) | undefined
let previewing = false

const kind = computed(() => state.value?.kind ?? 'dialog')
const fullscreen = computed(() => kind.value !== 'panel')
const paletteItems = computed(() => apps.value.map(a => ({ id: a.manifest.id, name: a.manifest.name, kind: 'app' })))

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

/** ESC = 拒绝当前请求（超时不持久化语义一致；遮罩/外点不关闭，必须显式决策或等超时） */
function onOverlayKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && kind.value === 'permission' && state.value?.permission) {
    action('resolve-permission', { requestId: state.value.permission.requestId, granted: false })
  }
}

onMounted(async () => {
  window.addEventListener('keydown', onOverlayKeydown)
  state.value = await shell().overlay.sync() as OverlayState
  unsubscribe = shell().overlay.onUpdated((next) => {
    state.value = next as OverlayState
  })
  if (kind.value === 'command-palette' || kind.value === 'app-center') {
    try { apps.value = await shell().apps.list() as AppSummary[] }
    catch { apps.value = [] }
  }
  if (kind.value === 'capture') {
    offFrame = shell().captureDialog.onFrame(({ base64 }) => {
      frame.value = `data:image/jpeg;base64,${base64}`
    })
    await startPreview()
  }
  // panel 的透明区穿透由窗口策略设定，卡片自身经 mouseenter/mouseleave 临时解除
  if (kind.value === 'panel') { shell().overlay.mouseIgnore(true) }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onOverlayKeydown)
  clearInterval(countdownTimer)
  unsubscribe?.()
  offFrame?.()
  void stopPreview()
})

async function startPreview(): Promise<void> {
  const session = state.value?.capture
  if (!session?.deviceId) { return }
  try {
    await shell().captureDialog.startPreview({ deviceId: session.deviceId, resolutionNum: session.resolutionNum })
    previewing = true
  }
  catch { frame.value = '' }
}

async function stopPreview(): Promise<void> {
  if (!previewing) { return }
  previewing = false
  await shell().captureDialog.stopPreview()
}

async function snap(): Promise<void> {
  if (busy.value) { return }
  busy.value = true
  try {
    const input = frame.value ? { dataUrl: frame.value } : {}
    const result = await shell().captureDialog.snap(input) as { imagePath: string, thumbDataUrl?: string }
    const max = state.value?.capture?.maxCount ?? 1
    shots.value = max <= 1 ? [result] : [...shots.value, result].slice(-max)
  }
  finally { busy.value = false }
}

async function confirmCapture(): Promise<void> {
  if (!shots.value.length) { return }
  // 主进程在结果交付后延迟收场：发起页先拿到结果，浮层不会秒关
  await shell().captureDialog.confirm(shots.value)
}

function cancelCapture(): void {
  void stopPreview()
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

/** 下载卡图标底色（按状态）：进行中品牌色 / 完成绿 / 失败红 */
const dlIconClass: Record<string, string> = {
  progressing: 'bg-primary',
  completed: 'bg-emerald-500',
  cancelled: 'bg-rose-500',
  interrupted: 'bg-rose-500',
  failed: 'bg-rose-500',
}

/**
 * 面板量高回报：量「自然内容高度」（超高内部滚动时的 scrollHeight 含溢出部分），
 * 回报 Main 调整窗口尺寸——回报裁剪值会引发窗口收缩死循环（master 同款教训）
 */
const PANEL_PADDING = 24
const panelRef = ref<HTMLElement | null>(null)

function reportHeight(): void {
  const panel = panelRef.value
  if (!panel || kind.value !== 'panel') { return }
  void shell().overlay.resize(panel.scrollHeight + PANEL_PADDING)
}

watch(() => [state.value?.notifications, state.value?.downloads], () => {
  void nextTick(reportHeight)
}, { deep: true, immediate: true })
</script>

<template>
  <div class="relative h-full w-full" :class="fullscreen ? 'flex items-center justify-center' : 'flex flex-col justify-end gap-2 p-3'">
    <template v-if="kind === 'panel'">
      <div
        ref="panelRef"
        class="flex max-h-full w-[320px] flex-col gap-2 overflow-y-auto [scrollbar-width:none]"
      >
        <div
          v-for="task in state?.downloads ?? []"
          :key="task.id"
          class="relative flex rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur"
          :title="task.path"
          @mouseenter="shell().overlay.mouseIgnore(false)"
          @mouseleave="shell().overlay.mouseIgnore(true)"
        >
          <span class="mr-2 mt-0.5 flex h-[22px] w-[22px] flex-none items-center justify-center rounded-md text-white" :class="dlIconClass[task.status] ?? dlIconClass.progressing">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></svg>
          </span>
          <div class="min-w-0 flex-1">
            <div class="truncate text-ui-sm font-medium text-foreground">
              {{ task.filename }}
            </div>
            <div class="mt-0.5 text-ui-xs text-muted-foreground">
              {{ statusText[task.status] ?? task.status }}
              <template v-if="task.status === 'progressing' && task.percent >= 0">
                · {{ task.percent }}%
              </template>
              <template v-if="task.total > 0">
                · {{ formatBytes(task.total) }}
              </template>
            </div>
            <div
              v-if="task.status === 'progressing' && task.percent >= 0"
              class="mt-1.5 h-1 overflow-hidden rounded-full bg-muted"
            >
              <div class="h-full rounded-full bg-primary transition-[width] duration-200" :style="{ width: `${task.percent}%` }" />
            </div>
            <div v-if="task.status === 'completed'" class="mt-1.5 flex justify-end gap-1.5">
              <Button variant="outline" class="h-6 px-2 text-ui-xs" @click="openDownload(task.id)">
                打开
              </Button>
              <Button variant="outline" class="h-6 px-2 text-ui-xs" @click="revealDownload(task.id)">
                文件夹
              </Button>
            </div>
          </div>
          <button class="absolute right-1.5 top-1.5 text-ui-xs text-muted-foreground" aria-label="关闭下载卡" @click="dismissDownload(task.id)">
            ✕
          </button>
        </div>
        <div
          v-for="item in state?.notifications ?? []"
          :key="item.id"
          class="relative flex rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur"
          @mouseenter="shell().overlay.mouseIgnore(false)"
          @mouseleave="shell().overlay.mouseIgnore(true)"
        >
          <span class="mr-2 mt-0.5 flex h-[22px] w-[22px] flex-none items-center justify-center rounded-md bg-primary text-white">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
          </span>
          <div class="min-w-0 flex-1">
            <div v-if="item.appName" class="text-ui-xs text-muted-foreground">
              {{ item.appName }}
            </div>
            <div class="text-ui-sm font-medium text-foreground">
              {{ item.title }}
            </div>
            <div v-if="item.body" class="mt-0.5 text-ui-xs leading-relaxed text-muted-foreground">
              {{ item.body }}
            </div>
          </div>
          <button class="absolute right-1.5 top-1.5 text-ui-xs text-muted-foreground" aria-label="关闭通知" @click="dismissNotification(item.id)">
            ✕
          </button>
        </div>
      </div>
    </template>

    <template v-else-if="kind === 'permission' && state?.permission">
      <div class="absolute inset-0 bg-black/30" />
      <div
        :key="state.permission.requestId"
        class="relative w-[400px] rounded-xl border border-t-[3px] border-t-primary bg-background p-5 shadow-2xl"
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
      <div class="w-[560px] rounded-xl border bg-background p-5 shadow-2xl">
        <div class="text-ui-base font-semibold text-foreground">
          {{ state?.capture?.title }}
        </div>
        <div class="mt-1 text-ui-xs text-muted-foreground">
          {{ state?.capture?.appName }} · {{ state?.capture?.deviceLabel ?? state?.capture?.deviceId ?? '默认采集设备' }}
        </div>
        <div class="mt-4 flex h-64 items-center justify-center overflow-hidden rounded-lg border border-dashed bg-muted/30">
          <img v-if="frame" :src="frame" alt="实时预览" class="h-full w-full object-contain">
          <span v-else class="text-ui-sm text-muted-foreground">预览未就绪，可直接拍摄</span>
        </div>
        <div class="mt-2 flex items-center gap-2 overflow-x-auto">
          <img
            v-for="(shot, i) in shots"
            :key="shot.imagePath"
            :src="shot.thumbDataUrl ?? ''"
            :alt="`拍摄 ${i + 1}`"
            class="h-12 w-12 rounded border object-cover"
          >
          <span class="text-ui-xs text-muted-foreground">{{ shots.length }} / {{ state?.capture?.maxCount ?? 1 }} 张</span>
        </div>
        <div class="mt-5 flex justify-end gap-2">
          <Button variant="outline" @click="cancelCapture">
            取消
          </Button>
          <Button variant="outline" :disabled="busy" @click="snap">
            拍摄
          </Button>
          <Button :disabled="!shots.length" @click="confirmCapture">
            确认回传
          </Button>
        </div>
      </div>
    </template>

    <template v-else-if="kind === 'settings'">
      <SettingsDialog :open="true" @update:open="close" />
    </template>

    <template v-else-if="kind === 'command-palette'">
      <CommandPalette :open="true" :items="paletteItems" :recent-ids="[]" @select="openApp" @update:open="close" />
    </template>

    <template v-else-if="kind === 'app-center'">
      <div class="w-[560px] rounded-xl border bg-background p-5 shadow-2xl">
        <div class="flex items-center justify-between">
          <div class="text-ui-base font-semibold text-foreground">
            应用中心
          </div>
          <button class="text-ui-sm text-muted-foreground" aria-label="关闭" @click="close">
            ✕
          </button>
        </div>
        <div class="mt-4 grid gap-2">
          <button
            v-for="app in apps"
            :key="app.manifest.id"
            class="flex items-center justify-between rounded-lg border px-3 py-2 text-ui-sm hover:bg-muted"
            @click="openApp(app.manifest.id)"
          >
            <span>{{ app.manifest.name }}</span>
            <span class="text-ui-xs text-muted-foreground">{{ app.manifest.id }}</span>
          </button>
          <div v-if="!apps.length" class="text-ui-sm text-muted-foreground">
            暂无已注册应用
          </div>
        </div>
      </div>
    </template>

    <template v-else-if="kind === 'update-prompt'">
      <div class="w-[420px] rounded-xl border bg-background p-5 shadow-2xl">
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
      <div class="w-[420px] rounded-xl border bg-background p-5 shadow-2xl">
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

    <template v-else>
      <div class="w-[420px] rounded-xl border bg-background p-5 shadow-2xl">
        <div class="text-ui-base font-semibold text-foreground">
          平台提示
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
