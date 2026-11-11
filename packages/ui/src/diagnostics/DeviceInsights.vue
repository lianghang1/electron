<script setup lang="ts">
import { desktop } from '@shell/bridge/client'
import { Badge, Button, Card, CardContent, CardHeader } from '@ui/components/ui'
import { Activity, RefreshCw, TriangleAlert } from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

interface DeviceStatusView {
  capabilityId: string
  state: 'unavailable' | 'ready' | 'busy' | 'degraded'
  reason?: string
  detail?: string
  channelId?: string
}

interface CapabilityStatView {
  calls: number
  failures: number
  totalDurationMs: number
  lastErrorCode?: string
}

interface TelemetryView {
  calls: number
  failures: number
  totalDurationMs: number
  byCapability: Record<string, CapabilityStatView>
}

const CAPABILITY_LABELS: Record<string, string> = {
  print: '打印',
  capture: '高拍仪拍摄',
  idcard: '身份证阅读',
  iccard: 'IC 卡读写',
  scanner: '扫码枪',
  signature: '签名板',
}

const REASON_LABELS: Record<string, string> = {
  'platform-unsupported': '平台未开放',
  'driver-missing': '驱动缺失',
  'vendor-sdk-unavailable': '厂商 SDK 不可用',
  'device-unplugged': '设备未连接',
  'channel-unavailable': '通道不可用',
  'timeout': '调用超时',
  'unknown': '未知原因',
}

const STATE_LABELS: Record<string, string> = {
  ready: '就绪',
  unavailable: '不可用',
  busy: '占用中',
  degraded: '降级',
}

const statuses = ref<DeviceStatusView[]>([])
const telemetry = ref<TelemetryView>({ calls: 0, failures: 0, totalDurationMs: 0, byCapability: {} })
const loadError = ref('')
const unsubscribe: (() => void)[] = []

const successRate = computed(() => {
  const total = telemetry.value.calls
  return total === 0 ? '—' : `${Math.round(((total - telemetry.value.failures) / total) * 100)}%`
})

async function loadSnapshot(): Promise<void> {
  loadError.value = ''
  try {
    const info = await desktop().shell.info() as { deviceStatus?: DeviceStatusView[], deviceTelemetry?: TelemetryView }
    statuses.value = info.deviceStatus ?? []
    if (info.deviceTelemetry) { telemetry.value = info.deviceTelemetry }
  }
  catch (err) {
    loadError.value = err instanceof Error ? err.message : String(err)
  }
}

function label(id: string): string {
  return CAPABILITY_LABELS[id] ?? id
}

onMounted(() => {
  void loadSnapshot()
  unsubscribe.push(desktop().onEvent('devices.telemetry-changed', (payload) => {
    telemetry.value = payload as TelemetryView
  }))
})

onBeforeUnmount(() => {
  for (const off of unsubscribe) { off() }
})
</script>

<template>
  <div class="flex h-full min-h-0 flex-col gap-4 overflow-auto p-4">
    <Card class="shrink-0">
      <CardHeader>
        <div class="flex items-center gap-2">
          <Activity :size="16" class="text-primary" />
          <span class="text-ui-base font-semibold text-foreground">调用观测</span>
          <Badge variant="soft" class="ml-auto">
            {{ telemetry.calls }} 次调用
          </Badge>
          <Button variant="ghost" size="icon-sm" @click="loadSnapshot">
            <RefreshCw :size="14" />
          </Button>
        </div>
      </CardHeader>
      <CardContent class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div class="rounded-md border border-border bg-background p-3">
          <div class="text-ui-caption text-muted-foreground">
            调用总数
          </div>
          <div class="text-ui-lg font-semibold text-foreground">
            {{ telemetry.calls }}
          </div>
        </div>
        <div class="rounded-md border border-border bg-background p-3">
          <div class="text-ui-caption text-muted-foreground">
            失败次数
          </div>
          <div class="text-ui-lg font-semibold" :class="telemetry.failures ? 'text-destructive' : 'text-foreground'">
            {{ telemetry.failures }}
          </div>
        </div>
        <div class="rounded-md border border-border bg-background p-3">
          <div class="text-ui-caption text-muted-foreground">
            成功率
          </div>
          <div class="text-ui-lg font-semibold text-foreground">
            {{ successRate }}
          </div>
        </div>
        <div class="rounded-md border border-border bg-background p-3">
          <div class="text-ui-caption text-muted-foreground">
            累计耗时
          </div>
          <div class="text-ui-lg font-semibold text-foreground">
            {{ telemetry.totalDurationMs }} ms
          </div>
        </div>
      </CardContent>
    </Card>

    <div v-if="loadError" class="shrink-0 rounded-md border border-destructive px-3 py-2 text-ui-caption text-destructive">
      观测数据读取失败：{{ loadError }}
    </div>

    <Card class="flex min-h-0 flex-1 flex-col">
      <CardHeader>
        <div class="flex items-center gap-2">
          <span class="text-ui-base font-semibold text-foreground">能力状态与打点</span>
          <Badge variant="outline" class="ml-1">
            {{ statuses.length }} 个能力
          </Badge>
        </div>
      </CardHeader>
      <CardContent class="flex flex-col gap-2">
        <div
          v-for="status in statuses"
          :key="status.capabilityId"
          class="flex flex-wrap items-center gap-2 rounded-md border border-border bg-background p-3"
        >
          <span class="min-w-24 text-ui-sm font-semibold text-foreground">{{ label(status.capabilityId) }}</span>
          <Badge :variant="status.state === 'ready' ? 'default' : 'outline'">
            {{ STATE_LABELS[status.state] ?? status.state }}
          </Badge>
          <Badge v-if="status.reason" variant="soft">
            {{ REASON_LABELS[status.reason] ?? status.reason }}
          </Badge>
          <span v-if="status.detail" class="w-full text-ui-caption text-muted-foreground">{{ status.detail }}</span>
          <span class="ml-auto font-mono text-ui-xs text-foreground-subtle">
            {{ telemetry.byCapability[status.capabilityId]?.calls ?? 0 }} 次 /
            {{ telemetry.byCapability[status.capabilityId]?.failures ?? 0 }} 失败
          </span>
          <span v-if="telemetry.byCapability[status.capabilityId]?.lastErrorCode" class="font-mono text-ui-xs text-destructive">
            {{ telemetry.byCapability[status.capabilityId]?.lastErrorCode }}
          </span>
        </div>
        <p v-if="statuses.some(s => s.state !== 'ready')" class="text-ui-caption text-muted-foreground">
          <TriangleAlert :size="12" class="mr-1 inline" />未开放能力的灰置依据来自平台能力表与三维注册表。
        </p>
        <div v-if="!statuses.length" class="py-6 text-center text-ui-caption text-foreground-subtle">
          暂无能力状态数据。
        </div>
      </CardContent>
    </Card>
  </div>
</template>
