<script setup lang="ts">
import type { ScenarioResultView } from '@shell/shared'
import type { ScenarioStreamEntry } from './scenario-stream'
import { Badge } from '@ui/components/ui'
import { computed, nextTick, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  view: ScenarioResultView
  result: unknown
  error: string
  events: readonly ScenarioStreamEntry[]
}>()

const VIEW_LABELS: Record<ScenarioResultView, string> = {
  json: '结构化数据',
  image: '图片',
  canvas: '笔迹画布',
  stream: '扫码历史',
  table: '扇区数据',
  idcard: '证卡信息',
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}
const text = (value: unknown): string => typeof value === 'string' ? value : ''

const json = computed(() => JSON.stringify(props.result ?? null, null, 2))

const imageSrc = computed(() => {
  const r = record(props.result)
  for (const key of ['thumbDataUrl', 'signImageDataUrl', 'photoDataUrl', 'imageDataUrl', 'dataUrl']) {
    if (typeof r[key] === 'string' && r[key]) { return r[key] as string }
  }
  const frame = [...props.events].reverse().find(e => e.event === 'capture.frame')
  const raw = frame ? record(frame.payload).frame : undefined
  if (typeof raw === 'string' && raw) {
    return raw.startsWith('data:') ? raw : `data:image/jpeg;base64,${raw}`
  }
  return ''
})

const scans = computed(() => props.events
  .filter(e => e.event === 'scanner.scanned')
  .map(e => ({ at: e.at, code: text(record(e.payload).code) || String(e.payload) })))

const ID_FIELDS: ReadonlyArray<readonly [string, string]> = [
  ['name', '姓名'],
  ['gender', '性别'],
  ['nation', '民族'],
  ['birthDate', '出生日期'],
  ['idNumber', '公民身份号码'],
  ['address', '住址'],
  ['issuer', '签发机关'],
  ['validFrom', '有效期起'],
  ['validTo', '有效期止'],
]
const idFields = computed(() => ID_FIELDS.map(([key, label]) => ({
  label,
  value: text(record(props.result)[key]) || '—',
})))
const idPhoto = computed(() => text(record(props.result).photoDataUrl))

const icMeta = computed(() => {
  const r = record(props.result)
  return [
    { label: '卡号 UID', value: text(r.uid) || '—' },
    { label: '十进制卡号', value: text(r.cardNumber) || '—' },
    { label: '卡类型', value: text(r.cardType) || '—' },
  ]
})
const icBlocks = computed(() => Object.entries(record(record(props.result).blocks))
  .map(([block, hex]) => ({ block, hex: String(hex) })))
const icTexts = computed(() => {
  const t = record(props.result).texts
  return Array.isArray(t) ? t.map(String) : []
})

interface InkPoint { x: number, y: number, phase?: string }
const inkPoints = computed<InkPoint[]>(() => {
  const fromEvents: InkPoint[] = props.events
    .filter(e => e.event === 'signature.stroke')
    .map(e => record(record(e.payload).point))
    .map(p => ({ x: Number(p.x), y: Number(p.y), phase: text(p.phase) }))
    .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y))
  if (fromEvents.length) { return fromEvents }
  const strokes = record(props.result).strokes
  if (!Array.isArray(strokes)) { return [] }
  const out: InkPoint[] = []
  for (const stroke of strokes) {
    const points = record(stroke).points
    if (!Array.isArray(points)) { continue }
    points.forEach((p, i) => {
      const q = record(p)
      out.push({ x: Number(q.x), y: Number(q.y), phase: i === 0 ? 'down' : 'move' })
    })
  }
  return out.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y))
})

const canvasEl = ref<HTMLCanvasElement | null>(null)

function drawInk(): void {
  const canvas = canvasEl.value
  if (!canvas) { return }
  const ctx = canvas.getContext('2d')
  if (!ctx) { return }
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const points = inkPoints.value
  if (!points.length) { return }
  const maxX = Math.max(1, ...points.map(p => p.x))
  const maxY = Math.max(1, ...points.map(p => p.y))
  const pad = 8
  const scale = Math.min((canvas.width - pad * 2) / maxX, (canvas.height - pad * 2) / maxY)
  ctx.strokeStyle = getComputedStyle(canvas).color
  ctx.lineWidth = 2
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.beginPath()
  let started = false
  for (const p of points) {
    const x = pad + p.x * scale
    const y = pad + p.y * scale
    if (!started || p.phase === 'down') {
      ctx.moveTo(x, y)
      started = true
    }
    else {
      ctx.lineTo(x, y)
    }
  }
  ctx.stroke()
}

onMounted(() => { void nextTick(drawInk) })
watch(() => [props.events, props.result, props.view], () => { void nextTick(drawInk) }, { deep: true })
</script>

<template>
  <div class="flex min-h-0 flex-col gap-2 rounded-md border border-border bg-card p-3 shadow-card">
    <div class="flex items-center gap-2">
      <span class="text-ui-sm font-semibold text-foreground">执行结果</span>
      <Badge variant="outline">
        {{ VIEW_LABELS[view] }}
      </Badge>
    </div>

    <div v-if="error" class="rounded-md border border-destructive bg-background p-3 font-mono text-ui-xs text-destructive">
      {{ error }}
    </div>

    <div v-else-if="view === 'json' && result === undefined" class="rounded-md border border-border bg-background p-4 text-center text-ui-caption text-foreground-subtle">
      点击上方动作后，返回数据会显示在这里
    </div>
    <pre
      v-else-if="view === 'json'"
      class="max-h-64 min-h-16 overflow-auto rounded-md border border-border bg-background p-3 font-mono text-ui-xs text-foreground"
    >{{ json }}</pre>

    <div v-else-if="view === 'image'" class="flex min-h-32 items-center justify-center rounded-md border border-border bg-background p-2">
      <img v-if="imageSrc" :src="imageSrc" alt="采集结果" class="max-h-72 max-w-full object-contain">
      <span v-else class="text-ui-caption text-foreground-subtle">执行拍摄或开始预览后，图片会显示在这里</span>
    </div>

    <div v-else-if="view === 'canvas'" class="rounded-md border border-border bg-background p-2">
      <canvas ref="canvasEl" width="560" height="240" class="w-full rounded-md bg-card text-foreground" />
      <p class="mt-1 text-ui-xs text-foreground-subtle">
        笔迹经 signature.stroke 实时推送；完成并回收后也可从返回的点集重绘。
      </p>
    </div>

    <div v-else-if="view === 'stream'" class="max-h-64 overflow-auto rounded-md border border-border bg-background">
      <div v-if="!scans.length" class="p-4 text-center text-ui-caption text-foreground-subtle">
        暂无扫码记录。模拟一次扫码后，历史会实时累积在这里。
      </div>
      <div v-for="(row, i) in scans" :key="i" class="flex items-center gap-2 border-b border-border px-3 py-2 font-mono text-ui-xs last:border-b-0">
        <span class="shrink-0 text-foreground-subtle">{{ row.at }}</span>
        <span class="min-w-0 break-all text-foreground">{{ row.code }}</span>
      </div>
    </div>

    <div v-else-if="view === 'table'" class="max-h-64 overflow-auto rounded-md border border-border bg-background">
      <div class="flex flex-wrap gap-2 border-b border-border px-3 py-2">
        <Badge v-for="m in icMeta" :key="m.label" variant="soft">
          {{ m.label }}：{{ m.value }}
        </Badge>
      </div>
      <div v-if="icTexts.length" class="border-b border-border px-3 py-2 text-ui-xs text-foreground">
        文本块：{{ icTexts.join(' / ') }}
      </div>
      <div v-if="!icBlocks.length" class="p-4 text-center text-ui-caption text-foreground-subtle">
        读取扇区后，块数据会按地址列在这里。
      </div>
      <table v-else class="w-full text-left font-mono text-ui-xs">
        <thead class="bg-accent text-accent-foreground">
          <tr>
            <th class="px-3 py-1.5">
              绝对块
            </th><th class="px-3 py-1.5">
              16 字节（hex）
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in icBlocks" :key="row.block" class="border-t border-border">
            <td class="px-3 py-1.5 text-foreground-subtle">
              {{ row.block }}
            </td>
            <td class="break-all px-3 py-1.5 text-foreground">
              {{ row.hex }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else-if="view === 'idcard'" class="flex flex-col gap-3 rounded-md border border-border bg-background p-3">
      <div class="flex flex-wrap gap-3">
        <img v-if="idPhoto" :src="idPhoto" alt="证件照片" class="h-32 w-24 rounded-md border border-border object-cover">
        <div v-else class="flex h-32 w-24 items-center justify-center rounded-md border border-border text-ui-xs text-foreground-subtle">
          暂无照片
        </div>
        <div class="grid flex-1 grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
          <div v-for="f in idFields" :key="f.label" class="flex gap-2 text-ui-xs">
            <span class="shrink-0 text-foreground-subtle">{{ f.label }}</span>
            <span class="min-w-0 break-all text-foreground">{{ f.value }}</span>
          </div>
        </div>
      </div>
      <p class="text-ui-xs text-foreground-subtle">
        证件信息仅用于现场验机展示，不写入日志、不持久化。
      </p>
    </div>
  </div>
</template>
