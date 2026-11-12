<script setup lang="ts">
import type { JobStatus, ScenarioPanelId, UnifiedPrinter } from '@shell/shared'
import type { ScenarioStreamEntry } from './scenario-stream'
import { Badge, Button } from '@ui/components/ui'
import { computed, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  panels: readonly ScenarioPanelId[]
  printers: readonly UnifiedPrinter[]
  events: readonly ScenarioStreamEntry[]
  refreshKey: number
  invoke: (method: string, input?: unknown) => Promise<unknown>
}>()

const emit = defineEmits<{ selectPrinter: [id: string] }>()

const jobs = ref<JobStatus[]>([])
const jobsError = ref('')
const confirmClear = ref(false)

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

async function reloadJobs(): Promise<void> {
  try {
    const list = await props.invoke('print.listPrintJobs', { maxCount: 20 })
    jobs.value = Array.isArray(list) ? list as JobStatus[] : []
    jobsError.value = ''
  }
  catch (err) {
    jobsError.value = err instanceof Error ? err.message : String(err)
  }
}

onMounted(() => {
  if (props.panels.includes('jobs')) { void reloadJobs() }
})
watch(() => props.refreshKey, () => {
  if (props.panels.includes('jobs')) { void reloadJobs() }
})

async function act(method: string, input?: unknown): Promise<void> {
  try {
    await props.invoke(method, input)
    await reloadJobs()
  }
  catch (err) {
    jobsError.value = err instanceof Error ? err.message : String(err)
  }
}

const previewFrame = computed(() => {
  const entry = [...props.events].reverse().find(e => e.event === 'capture.frame')
  const raw = entry ? record(entry.payload).frame : undefined
  if (typeof raw !== 'string' || !raw) { return '' }
  return raw.startsWith('data:') ? raw : `data:image/jpeg;base64,${raw}`
})
</script>

<template>
  <div class="flex min-h-0 flex-col gap-3">
    <div v-if="panels.includes('printers')" class="rounded-md border border-border bg-card p-3 shadow-card">
      <div class="mb-2 flex items-center gap-2">
        <span class="text-ui-sm font-semibold text-foreground">打印机与能力</span>
        <Badge variant="outline">
          {{ printers.length }} 台
        </Badge>
      </div>
      <div v-if="!printers.length" class="text-ui-caption text-foreground-subtle">
        未检测到系统打印机；可改用「仿真送打 / 只出预览 PDF」验证完整链路。
      </div>
      <div v-else class="max-h-48 overflow-auto rounded-md border border-border">
        <table class="w-full text-left text-ui-xs">
          <thead class="bg-accent text-accent-foreground">
            <tr>
              <th class="px-2 py-1.5">
                设备名
              </th>
              <th class="px-2 py-1.5">
                状态
              </th>
              <th class="px-2 py-1.5">
                纸型
              </th>
              <th class="px-2 py-1.5">
                能力
              </th>
              <th class="px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in printers" :key="p.id" class="border-t border-border">
              <td class="px-2 py-1.5 text-foreground">
                {{ p.displayName }}
                <span v-if="p.isDefault" class="ml-1 text-ui-xs text-foreground-subtle">默认</span>
              </td>
              <td class="px-2 py-1.5 text-foreground-subtle">
                {{ p.status }}
              </td>
              <td class="px-2 py-1.5 text-foreground-subtle">
                {{ p.capabilities?.paperList?.length ?? '—' }}
              </td>
              <td class="px-2 py-1.5 text-foreground-subtle">
                {{ p.capabilities?.duplexSupported ? '双面' : '单面' }} · {{ p.capabilities?.colorSupported ? '彩色' : '黑白' }}
              </td>
              <td class="px-2 py-1.5">
                <Button size="xs" variant="ghost" @click="emit('selectPrinter', p.id)">
                  选用
                </Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="panels.includes('jobs')" class="rounded-md border border-border bg-card p-3 shadow-card">
      <div class="mb-2 flex flex-wrap items-center gap-2">
        <span class="text-ui-sm font-semibold text-foreground">打印任务簿</span>
        <Badge variant="outline">
          {{ jobs.length }} 条
        </Badge>
        <Button size="xs" variant="ghost" class="ml-auto" @click="reloadJobs">
          刷新
        </Button>
        <Button v-if="!confirmClear" size="xs" variant="outline" @click="confirmClear = true">
          清空
        </Button>
        <template v-else>
          <span class="text-ui-xs text-destructive">清空不可恢复</span>
          <Button size="xs" variant="destructive" @click="confirmClear = false; act('print.clearPrintJobs', undefined)">
            确认
          </Button>
          <Button size="xs" variant="ghost" @click="confirmClear = false">
            取消
          </Button>
        </template>
      </div>
      <div v-if="jobsError" class="mb-2 text-ui-xs text-destructive">
        {{ jobsError }}
      </div>
      <div v-if="!jobs.length" class="text-ui-caption text-foreground-subtle">
        暂无任务，提交打印后会在这里出现。
      </div>
      <div v-else class="max-h-48 overflow-auto rounded-md border border-border">
        <div v-for="j in jobs" :key="j.jobId" class="flex flex-wrap items-center gap-2 border-b border-border px-2 py-1.5 text-ui-xs last:border-b-0">
          <Badge :variant="j.state === 'done' ? 'soft' : j.state === 'failed' ? 'outline' : 'default'">
            {{ j.state }}
          </Badge>
          <span class="min-w-0 flex-1 break-all font-mono text-foreground">{{ j.jobName || j.jobId }}</span>
          <span class="text-foreground-subtle">{{ j.result?.channel ?? j.error?.code ?? '—' }}</span>
          <Button size="xs" variant="ghost" @click="act('print.reprintJob', { printJobId: j.jobId })">
            重打
          </Button>
          <Button size="xs" variant="ghost" @click="act('print.removePrintJob', { printJobId: j.jobId })">
            删除
          </Button>
        </div>
      </div>
    </div>

    <div v-if="panels.includes('preview')" class="rounded-md border border-border bg-card p-3 shadow-card">
      <div class="mb-2 text-ui-sm font-semibold text-foreground">
        实时预览
      </div>
      <div class="flex min-h-32 items-center justify-center rounded-md border border-border bg-background p-2">
        <img v-if="previewFrame" :src="previewFrame" alt="实时预览帧" class="max-h-56 max-w-full object-contain">
        <span v-else class="text-ui-caption text-foreground-subtle">点击「开始预览」后，采集帧会实时显示在这里</span>
      </div>
    </div>
  </div>
</template>
