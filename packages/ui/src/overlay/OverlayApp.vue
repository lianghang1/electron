<script setup lang="ts">
import type { DownloadTask } from '@shell/shared'
import { desktop } from '@shell/bridge/client'
import { Badge, Button } from '@ui/components/ui'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import CommandPalette from '../shell/CommandPalette.vue'
import SettingsDialog from '../shell/SettingsDialog.vue'

interface NotificationItem {
  id: string
  title: string
  body?: string
  level: string
  ttlMs: number
}

interface PermissionView {
  requestId: string
  appId: string
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
  kind: string
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

onMounted(async () => {
  state.value = await desktop().overlay.sync() as OverlayState
  unsubscribe = desktop().overlay.onUpdated((next) => {
    state.value = next as OverlayState
  })
  if (kind.value === 'command-palette' || kind.value === 'app-center') {
    try { apps.value = await desktop().apps.list() as AppSummary[] }
    catch { apps.value = [] }
  }
  if (kind.value === 'capture') {
    offFrame = desktop().captureDialog.onFrame(({ base64 }) => {
      frame.value = `data:image/jpeg;base64,${base64}`
    })
    await startPreview()
  }
  // panel 的透明区穿透由窗口策略设定，卡片自身经 mouseenter/mouseleave 临时解除
  if (kind.value === 'panel') { desktop().overlay.mouseIgnore(true) }
})

onBeforeUnmount(() => {
  unsubscribe?.()
  offFrame?.()
  void stopPreview()
})

async function startPreview(): Promise<void> {
  const session = state.value?.capture
  if (!session?.deviceId) { return }
  try {
    await desktop().captureDialog.startPreview(session.deviceId, session.resolutionNum)
    previewing = true
  }
  catch { frame.value = '' }
}

async function stopPreview(): Promise<void> {
  if (!previewing) { return }
  previewing = false
  await desktop().captureDialog.stopPreview()
}

async function snap(): Promise<void> {
  if (busy.value) { return }
  busy.value = true
  try {
    const input = frame.value ? { dataUrl: frame.value } : {}
    const result = await desktop().captureDialog.snap(input) as { imagePath: string, thumbDataUrl?: string }
    const max = state.value?.capture?.maxCount ?? 1
    shots.value = max <= 1 ? [result] : [...shots.value, result].slice(-max)
  }
  finally { busy.value = false }
}

async function confirmCapture(): Promise<void> {
  if (!shots.value.length) { return }
  // 主进程在结果交付后延迟收场：发起页先拿到结果，浮层不会秒关
  await desktop().captureDialog.confirm(shots.value)
}

function cancelCapture(): void {
  void stopPreview()
  close()
}

function action(type: string, extra: Record<string, unknown> = {}): void {
  void desktop().overlay.action({ kind: kind.value, type, ...extra })
}

function close(): void {
  void desktop().overlay.dismiss(kind.value)
}

async function openApp(appId: string): Promise<void> {
  await desktop().apps.open(appId)
  close()
}

function dismissNotification(id: string): void {
  void desktop().notifications.dismiss(id)
}

function dismissDownload(taskId: string): void {
  void desktop().downloads.dismiss(taskId)
}

const levelTone: Record<string, string> = {
  info: 'bg-sky-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  error: 'bg-rose-500',
}
</script>

<template>
  <div class="h-full w-full" :class="fullscreen ? 'flex items-center justify-center' : 'flex flex-col justify-end gap-2 p-3'">
    <template v-if="kind === 'panel'">
      <div
        v-for="item in state?.notifications ?? []"
        :key="item.id"
        class="relative rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur"
        @mouseenter="desktop().overlay.mouseIgnore(false)"
        @mouseleave="desktop().overlay.mouseIgnore(true)"
      >
        <div class="absolute left-0 top-3 h-6 w-1 rounded-r" :class="levelTone[item.level] ?? levelTone.info" />
        <div class="flex items-start justify-between gap-2">
          <div class="text-ui-sm font-medium text-foreground">
            {{ item.title }}
          </div>
          <button class="text-ui-xs text-muted-foreground" aria-label="关闭通知" @click="dismissNotification(item.id)">
            ✕
          </button>
        </div>
        <div v-if="item.body" class="mt-1 text-ui-xs text-muted-foreground">
          {{ item.body }}
        </div>
      </div>
      <div
        v-for="task in state?.downloads ?? []"
        :key="task.id"
        class="rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur"
        @mouseenter="desktop().overlay.mouseIgnore(false)"
        @mouseleave="desktop().overlay.mouseIgnore(true)"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="truncate text-ui-sm font-medium text-foreground">
            {{ task.filename }}
          </div>
          <button class="text-ui-xs text-muted-foreground" aria-label="关闭下载卡" @click="dismissDownload(task.id)">
            ✕
          </button>
        </div>
        <div class="mt-1 flex items-center gap-2">
          <Badge variant="secondary" class="text-ui-xs">
            {{ task.status }}
          </Badge>
          <span v-if="task.percent >= 0 && task.status === 'progressing'" class="text-ui-xs text-muted-foreground">{{ task.percent }}%</span>
        </div>
      </div>
    </template>

    <template v-else-if="kind === 'permission' && state?.permission">
      <div class="w-[420px] rounded-xl border bg-background p-5 shadow-2xl">
        <div class="text-ui-base font-semibold text-foreground">
          权限请求
        </div>
        <div class="mt-2 text-ui-sm text-muted-foreground">
          应用 <span class="font-medium text-foreground">{{ state?.permission?.appId }}</span> 请求
          <span class="font-medium text-foreground">{{ state?.permission?.permission }}</span>
        </div>
        <div class="mt-1 text-ui-xs text-muted-foreground">
          来源：{{ state?.permission?.origin }}
        </div>
        <div class="mt-5 flex justify-end gap-2">
          <Button variant="outline" @click="action('resolve-permission', { requestId: state?.permission?.requestId, granted: false })">
            拒绝
          </Button>
          <Button @click="action('resolve-permission', { requestId: state?.permission?.requestId, granted: true })">
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
          <Button @click="desktop().shell.relaunch()">
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
