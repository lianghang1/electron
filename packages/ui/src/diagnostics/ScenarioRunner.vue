<script setup lang="ts">
import type { DeviceCapabilityId, ScenarioAction, ScenarioField, ScenarioResultView, ScenarioValue, UnifiedPrinter } from '@shell/shared'
import type { ScenarioStreamEntry } from './scenario-stream'
import { desktop } from '@shell/bridge/client'
import { DIAGNOSTIC_SCENARIOS, fieldVisible, scenarioDefaults, scenarioInput } from '@shell/shared'
import { Badge, Button, Input, Label, Select, Switch, Textarea } from '@ui/components/ui'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ScenarioPanels from './ScenarioPanels.vue'
import ScenarioResult from './ScenarioResult.vue'

const props = defineProps<{
  capabilityId: DeviceCapabilityId
  enabled: boolean
}>()

const spec = computed(() => DIAGNOSTIC_SCENARIOS[props.capabilityId])
const activeKind = ref('')
const values = ref<Record<string, ScenarioValue>>({})
const dynamicOptions = ref<Record<string, Array<{ value: string, label: string }>>>({})
const printers = ref<UnifiedPrinter[]>([])
const events = ref<ScenarioStreamEntry[]>([])
const result = ref<unknown>(undefined)
const error = ref('')
const hasRun = ref(false)
const pending = ref(false)
const elapsed = ref(0)
const currentView = ref<ScenarioResultView>('json')
const confirmId = ref('')
const refreshKey = ref(0)

/* 本机摄像头（UVC）：渲染层 getUserMedia 路线，不走 SDK 通道；
   抓拍帧填入 imageDataUrl 字段，由「保存图片」动作经 capture.saveCapturedImage 落盘 */
const uvcStream = ref<MediaStream | null>(null)
const uvcVideoEl = ref<HTMLVideoElement | null>(null)
const uvcError = ref('')

async function uvcEnumerate(): Promise<void> {
  try {
    if (!navigator.mediaDevices?.enumerateDevices()) { throw new Error('当前环境不支持媒体设备枚举') }
    const list = await navigator.mediaDevices.enumerateDevices()
    const cameras = list.filter(d => d.kind === 'videoinput')
    setOptions('deviceId', cameras.map((d, i) => ({ value: d.deviceId, label: d.label || `摄像头 ${i + 1}` })))
    uvcError.value = cameras.length ? '' : '未枚举到本机摄像头（或尚未授权，开启一次后名称可见）'
  }
  catch (err) {
    uvcError.value = err instanceof Error ? err.message : String(err)
  }
}

async function uvcStart(): Promise<void> {
  try {
    await uvcStop()
    const deviceId = String(values.value.deviceId ?? '')
    const stream = await navigator.mediaDevices.getUserMedia({
      video: deviceId ? { deviceId: { exact: deviceId } } : true,
      audio: false,
    })
    uvcStream.value = stream
    await nextTick()
    if (uvcVideoEl.value) { uvcVideoEl.value.srcObject = stream }
    uvcError.value = ''
    await uvcEnumerate()
  }
  catch (err) {
    uvcError.value = err instanceof Error ? err.message : String(err)
  }
}

async function uvcStop(): Promise<void> {
  uvcStream.value?.getTracks().forEach(track => track.stop())
  uvcStream.value = null
  if (uvcVideoEl.value) { uvcVideoEl.value.srcObject = null }
}

function uvcSnap(): void {
  const video = uvcVideoEl.value
  if (!video?.videoWidth) {
    uvcError.value = '摄像头未开启，无法抓拍'
    return
  }
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  canvas.getContext('2d')?.drawImage(video, 0, 0)
  const ext = String(values.value.imageExtension ?? 'png').toLowerCase() === 'jpg' ? 'jpeg' : 'png'
  values.value.imageDataUrl = canvas.toDataURL(`image/${ext}`)
  uvcError.value = ''
}

const offs: Array<() => void> = []
let seq = 0

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}
const invoke = (method: string, input?: unknown): Promise<unknown> => desktop().invoke(method, input)

const visibleFields = computed(() => spec.value.fields.filter(f => fieldVisible(f, activeKind.value)))
const groups = computed(() => {
  const map = new Map<string, ScenarioField[]>()
  for (const field of visibleFields.value) {
    const key = field.group ?? '基本参数'
    map.set(key, [...(map.get(key) ?? []), field])
  }
  return [...map.entries()]
})

function optionsFor(field: ScenarioField): Array<{ value: string, label: string }> {
  const out: Array<{ value: string, label: string }> = []
  const seen = new Set<string>()
  for (const option of [...(field.options ?? []), ...(field.source ? dynamicOptions.value[field.key] ?? [] : [])]) {
    if (!seen.has(option.value)) {
      seen.add(option.value)
      out.push(option)
    }
  }
  return out
}

function setOptions(key: string, list: Array<{ value: string, label: string }>): void {
  dynamicOptions.value = { ...dynamicOptions.value, [key]: list }
}

function refreshPapers(): void {
  const id = String(values.value.printerId ?? '')
  const printer = printers.value.find(p => p.id === id) ?? printers.value.find(p => p.isDefault)
  const papers = printer?.capabilities?.paperList ?? []
  setOptions('paper', papers.map(p => ({
    value: p.name,
    label: p.widthMm && p.heightMm ? `${p.name}（${p.widthMm}×${p.heightMm}mm）` : p.name,
  })))
}

async function loadSources(): Promise<void> {
  const s = spec.value
  if (s.fields.some(f => f.source === 'printers' || f.source === 'papers')) {
    try {
      const list = await invoke('print.listDevices', undefined)
      printers.value = Array.isArray(list) ? list as UnifiedPrinter[] : []
      setOptions('printerId', printers.value.map(p => ({ value: p.id, label: p.isDefault ? `${p.displayName}（默认）` : p.displayName })))
      refreshPapers()
    }
    catch { printers.value = [] }
  }
  if (s.deviceMethod) {
    try {
      const list = await invoke(s.deviceMethod, undefined)
      if (Array.isArray(list)) {
        setOptions('deviceId', list.map((d) => {
          const r = record(d)
          return { value: String(r.id ?? r.deviceId ?? ''), label: String(r.displayName ?? r.name ?? r.id ?? '设备') }
        }).filter(o => o.value))
      }
    }
    catch { /* 枚举失败时保留静态选项 */ }
  }
  if (s.fields.some(f => f.source === 'cameras')) {
    try {
      const list = await invoke('capture.listDeviceCameras', { deviceId: String(values.value.deviceId ?? '') })
      if (Array.isArray(list)) {
        setOptions('deviceId', list.map((c) => {
          const r = record(c)
          return { value: String(r.id ?? ''), label: String(r.name ?? r.id ?? '摄像头') }
        }).filter(o => o.value))
      }
    }
    catch { /* 枚举失败时保留静态选项 */ }
  }
}

function subscribe(): void {
  for (const event of spec.value.events) {
    offs.push(desktop().onEvent(event, (payload) => {
      events.value = [{
        id: ++seq,
        event,
        at: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
        payload,
      }, ...events.value].slice(0, 60)
    }))
  }
}

function reset(): void {
  for (const off of offs) { off() }
  offs.length = 0
  void uvcStop()
  activeKind.value = spec.value.kinds[0]?.id ?? ''
  values.value = scenarioDefaults(spec.value.fields)
  dynamicOptions.value = {}
  printers.value = []
  events.value = []
  result.value = undefined
  error.value = ''
  hasRun.value = false
  confirmId.value = ''
  currentView.value = spec.value.resultView
  subscribe()
  void loadSources()
}

function update(field: ScenarioField, raw: string | number | boolean): void {
  values.value[field.key] = field.kind === 'number' ? Number(raw) : raw
}

function onSelectPrinter(id: string): void {
  values.value.printerId = id
  refreshPapers()
}

async function pickFile(field: ScenarioField): Promise<void> {
  const kind: 'image' | 'pdf' | 'any' = activeKind.value === 'image' ? 'image' : activeKind.value === 'pdf' ? 'pdf' : 'any'
  const path = await desktop().diagnostics.pickFile(kind)
  if (path) { values.value[field.key] = path }
}

async function run(action: ScenarioAction): Promise<void> {
  if (pending.value) { return }
  if (action.dangerous && confirmId.value !== action.id) {
    confirmId.value = action.id
    return
  }
  confirmId.value = ''
  pending.value = true
  error.value = ''
  result.value = undefined
  currentView.value = action.resultView ?? spec.value.resultView
  const started = performance.now()
  try {
    result.value = await invoke(action.method, scenarioInput(spec.value, action, values.value, activeKind.value))
    hasRun.value = true
    refreshKey.value++
  }
  catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
    hasRun.value = true
  }
  finally {
    elapsed.value = Math.round(performance.now() - started)
    pending.value = false
  }
}

watch(() => props.capabilityId, reset)
watch(() => values.value.printerId, refreshPapers)
watch(activeKind, (kind) => {
  // 形态切换即切换摄像头路线：UVC 用渲染层枚举，SDK 路线回落设备目录；离开 UVC 释放摄像头
  if (kind === 'uvc') { void uvcEnumerate() }
  else { void uvcStop() }
})
onMounted(reset)
onBeforeUnmount(() => {
  for (const off of offs) { off() }
  void uvcStop()
})
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-2">
      <span class="text-ui-base font-semibold text-foreground">{{ spec.label }}</span>
      <Badge :variant="enabled ? 'default' : 'outline'">
        {{ enabled ? '已启用' : '平台未启用' }}
      </Badge>
      <span class="text-ui-caption text-muted-foreground">{{ spec.summary }}</span>
    </div>

    <div v-if="spec.kinds.length > 1" class="flex flex-wrap items-center gap-1.5">
      <span class="mr-1 text-ui-caption text-foreground-subtle">内容形态</span>
      <Button
        v-for="kind in spec.kinds"
        :key="kind.id"
        size="xs"
        :variant="activeKind === kind.id ? 'default' : 'outline'"
        @click="activeKind = kind.id; confirmId = ''"
      >
        {{ kind.label }}
      </Button>
    </div>

    <div v-if="!enabled" class="rounded-md bg-accent px-3 py-2 text-ui-caption text-accent-foreground">
      当前平台未启用该设备域，调用会在路由层被拒绝；可切换到仿真或预览通道验证界面链路。
    </div>

    <div class="grid grid-cols-1 gap-3 xl:grid-cols-2">
      <div class="flex flex-col gap-3">
        <div v-for="[group, fields] in groups" :key="group" class="rounded-md border border-border bg-card p-3 shadow-card">
          <div class="mb-2 text-ui-sm font-semibold text-foreground">
            {{ group }}
          </div>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div v-for="field in fields" :key="field.key" class="flex flex-col gap-1.5">
              <Label>{{ field.label }}<span v-if="field.required" class="text-destructive"> *</span></Label>
              <Select
                v-if="field.kind === 'select'"
                :model-value="String(values[field.key] ?? '')"
                :options="optionsFor(field)"
                @update:model-value="update(field, $event)"
              />
              <Textarea
                v-else-if="field.kind === 'textarea' || field.kind === 'json'"
                :model-value="String(values[field.key] ?? '')"
                :rows="field.kind === 'json' ? 3 : 4"
                @update:model-value="update(field, $event)"
              />
              <div v-else-if="field.kind === 'boolean'" class="flex h-9 items-center">
                <Switch :model-value="Boolean(values[field.key])" @update:model-value="update(field, $event)" />
              </div>
              <div v-else-if="field.kind === 'file'" class="flex gap-1.5">
                <Input :model-value="String(values[field.key] ?? '')" :placeholder="field.placeholder" readonly @update:model-value="update(field, $event)" />
                <Button size="sm" variant="outline" class="shrink-0" @click="pickFile(field)">
                  选择文件
                </Button>
              </div>
              <Input
                v-else
                :model-value="String(values[field.key] ?? '')"
                :type="field.kind === 'number' ? 'number' : 'text'"
                :placeholder="field.placeholder"
                :min="field.min"
                :max="field.max"
                @update:model-value="update(field, $event)"
              />
              <span v-if="field.hint" class="text-ui-xs text-foreground-subtle">{{ field.hint }}</span>
            </div>
          </div>
        </div>

        <div class="rounded-md border border-border bg-card p-3 shadow-card">
          <div class="mb-2 text-ui-sm font-semibold text-foreground">
            场景动作
          </div>
          <div class="flex flex-wrap gap-2">
            <template v-for="action in spec.actions" :key="action.id">
              <Button
                size="sm"
                :variant="action.dangerous ? 'destructive' : (action.tone ?? 'default')"
                :disabled="!enabled || pending"
                @click="run(action)"
              >
                {{ action.label }}
              </Button>
              <span v-if="confirmId === action.id" class="flex flex-wrap items-center gap-1.5 text-ui-xs text-destructive">
                {{ action.confirm ?? '确认继续？' }}
                <Button size="xs" variant="destructive" @click="run(action)">确认执行</Button>
                <Button size="xs" variant="ghost" @click="confirmId = ''">取消</Button>
              </span>
              <span v-else-if="action.hint" class="w-full text-ui-xs text-foreground-subtle">{{ action.hint }}</span>
            </template>
          </div>
          <div v-if="hasRun" class="mt-2 flex items-center gap-2 text-ui-caption">
            <span :class="error ? 'text-destructive' : 'text-ok'">{{ error ? '失败' : '成功' }}</span>
            <span class="text-foreground-subtle">{{ elapsed }} ms</span>
          </div>
        </div>

        <ScenarioResult :view="currentView" :result="result" :error="error" :events="events" />
      </div>

      <div class="flex flex-col gap-3">
        <div v-if="activeKind === 'uvc'" class="rounded-md border border-border bg-card p-3 shadow-card">
          <div class="mb-2 flex items-center gap-2">
            <span class="text-ui-sm font-semibold text-foreground">本机摄像头</span>
            <Badge variant="outline">
              UVC · 渲染层 getUserMedia
            </Badge>
          </div>
          <div class="flex min-h-40 items-center justify-center rounded-md border border-border bg-background p-2">
            <video
              v-show="uvcStream"
              ref="uvcVideoEl"
              autoplay
              playsinline
              muted
              class="max-h-64 w-full rounded-md object-contain"
            />
            <span v-if="!uvcStream" class="text-ui-caption text-foreground-subtle">点击「开启摄像头」后，本机摄像头画面会显示在这里</span>
          </div>
          <div class="mt-2 flex flex-wrap items-center gap-2">
            <Button size="sm" :variant="uvcStream ? 'outline' : 'default'" @click="uvcStream ? uvcStop() : uvcStart()">
              {{ uvcStream ? '关闭摄像头' : '开启摄像头' }}
            </Button>
            <Button size="sm" variant="outline" :disabled="!uvcStream" @click="uvcSnap">
              抓拍到 DataURL
            </Button>
            <span v-if="uvcError" class="text-ui-xs text-destructive">{{ uvcError }}</span>
          </div>
          <p class="mt-1.5 text-ui-xs text-foreground-subtle">
            抓拍帧填入「图片 DataURL」字段；高拍仪 SDK 不在时，可用本机摄像头验证拍摄落盘与打印链路。
          </p>
        </div>

        <ScenarioPanels
          :panels="spec.panels"
          :printers="printers"
          :events="events"
          :refresh-key="refreshKey"
          :invoke="invoke"
          @select-printer="onSelectPrinter"
        />
      </div>
    </div>
  </div>
</template>
