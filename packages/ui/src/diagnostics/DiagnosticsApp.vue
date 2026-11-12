<script setup lang="ts">
import type { DeviceCapabilityId } from '@shell/shared'
import { desktop } from '@shell/bridge/client'
import { DIAGNOSTIC_CATALOG, DIAGNOSTIC_SCENARIOS, SCENARIO_CAPABILITY_IDS } from '@shell/shared'
import { Badge, Button, Tabs, TabsContent, TabsList, TabsTrigger } from '@ui/components/ui'
import {
  Activity,
  Camera,
  CreditCard,
  FlaskConical,
  IdCard,
  Loader2,
  MonitorCog,
  PenLine,
  Printer,
  RefreshCw,
  ScanLine,
  Settings2,
} from 'lucide-vue-next'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import DeviceConfigPanel from './DeviceConfigPanel.vue'
import DeviceInsights from './DeviceInsights.vue'
import EventStream from './EventStream.vue'
import MethodRunner from './MethodRunner.vue'
import PlatformPanel from './PlatformPanel.vue'
import ScenarioRunner from './ScenarioRunner.vue'

interface ShellInfo {
  name: string
  version: string
  chrome: 'platform' | 'solo'
  mode: 'desktop' | 'kiosk'
  capabilities: {
    platform: string
    availableDomains: string[]
    driverDeployment: string
    notes?: string
  }
  deviceHostReady?: boolean
}

const ICONS = { Camera, IdCard, CreditCard, PenLine, ScanLine, Printer }

const info = ref<ShellInfo | null>(null)
const loadError = ref('')
const active = ref('capture')
const scenarioCapability = ref<DeviceCapabilityId>('print')
const domains = DIAGNOSTIC_CATALOG
const clock = ref('')
// 启动门禁：守护进程预热完成前，设备相关入口进入「初始化中」过渡态而非可点状态
// （快照取 shell.info 的 deviceHostReady，就绪事件 devices.ready 即时解除）
const deviceReady = ref(false)

const available = computed(() => new Set(info.value?.capabilities.availableDomains ?? []))
const enabledCount = computed(() => domains.filter(d => available.value.has(d.name)).length)

let offDeviceReady: (() => void) | undefined

async function loadInfo() {
  loadError.value = ''
  try {
    info.value = await desktop().shell.info() as ShellInfo
    deviceReady.value = info.value.deviceHostReady === true
    clock.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  }
  catch (err) {
    loadError.value = err instanceof Error ? err.message : String(err)
  }
}

onMounted(() => {
  void loadInfo()
  offDeviceReady = desktop().onEvent('devices.ready', () => {
    deviceReady.value = true
  })
})

onUnmounted(() => {
  offDeviceReady?.()
})
</script>

<template>
  <div class="flex h-full min-h-0 w-full flex-col bg-background text-foreground">
    <div class="flex shrink-0 items-center gap-3 border-b border-border bg-card px-5 py-3">
      <div class="flex size-9 items-center justify-center rounded-icon bg-accent text-accent-foreground">
        <MonitorCog :size="19" />
      </div>
      <div class="min-w-0">
        <h1 class="text-ui-lg font-semibold text-foreground">
          系统功能检测
        </h1>
        <p class="text-ui-caption text-muted-foreground">
          硬件域调用与平台自检 · 人工验机工具
        </p>
      </div>
      <div class="ml-auto flex flex-wrap items-center justify-end gap-2">
        <Badge variant="outline">
          {{ info?.capabilities.platform ?? '检测中' }}
        </Badge>
        <Badge variant="soft">
          驱动 {{ info?.capabilities.driverDeployment ?? '—' }}
        </Badge>
        <Badge :variant="enabledCount === domains.length ? 'default' : 'outline'">
          可用域 {{ enabledCount }} / {{ domains.length }}
        </Badge>
        <span class="hidden text-ui-xs text-foreground-subtle sm:inline">{{ clock }}</span>
        <Button variant="ghost" size="icon-sm" @click="loadInfo">
          <RefreshCw :size="14" />
        </Button>
      </div>
    </div>

    <div v-if="loadError" class="shrink-0 border-b border-destructive bg-background px-5 py-2 text-ui-caption text-destructive">
      平台信息读取失败：{{ loadError }}
    </div>

    <div v-if="info?.capabilities.notes" class="shrink-0 border-b border-border bg-accent px-5 py-1.5 text-ui-caption text-accent-foreground">
      {{ info.capabilities.notes }}
    </div>

    <Tabs v-model="active" class="min-h-0 flex-1 flex-col">
      <TabsList class="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <TabsTrigger v-for="domain in domains" :key="domain.name" :value="domain.name" class="shrink-0">
          <component :is="ICONS[domain.icon as keyof typeof ICONS]" :size="14" class="mr-1.5 inline" />
          {{ domain.label }}
          <span v-if="available.has(domain.name) && !deviceReady" class="ml-1 text-ui-xs text-foreground-subtle">· 初始化中</span>
          <span v-else-if="!available.has(domain.name)" class="ml-1 text-ui-xs text-foreground-subtle">· 未启用</span>
        </TabsTrigger>
        <TabsTrigger value="scenarios">
          <FlaskConical :size="14" class="mr-1.5 inline" />场景验机
        </TabsTrigger>
        <TabsTrigger value="platform">
          <MonitorCog :size="14" class="mr-1.5 inline" />平台自检
        </TabsTrigger>
        <TabsTrigger value="insights">
          <Activity :size="14" class="mr-1.5 inline" />运行观测
        </TabsTrigger>
        <TabsTrigger value="config">
          <Settings2 :size="14" class="mr-1.5 inline" />设备配置
        </TabsTrigger>
      </TabsList>

      <div class="flex min-h-0 flex-1">
        <div class="flex min-h-0 flex-1 flex-col">
          <TabsContent v-for="domain in domains" :key="domain.name" :value="domain.name" class="p-4">
            <div class="mx-auto flex w-full max-w-5xl flex-col gap-3">
              <div class="flex items-center gap-2">
                <component :is="ICONS[domain.icon as keyof typeof ICONS]" :size="16" class="text-primary" />
                <span class="text-ui-base font-semibold text-foreground">{{ domain.label }}</span>
                <Badge :variant="available.has(domain.name) ? 'default' : 'outline'">
                  {{ available.has(domain.name) ? '已启用' : '平台未启用' }}
                </Badge>
                <span class="ml-auto text-ui-caption text-foreground-subtle">{{ domain.methods.length }} 个方法</span>
              </div>
              <p class="text-ui-caption text-muted-foreground">
                {{ domain.description }}
              </p>
              <!-- 启动门禁：已启用域在守护进程就绪前进入「初始化中」过渡态，方法入口不可点 -->
              <div v-if="available.has(domain.name) && !deviceReady" class="rounded-md border border-border bg-card p-4">
                <div class="flex items-center gap-2 text-ui-caption text-muted-foreground">
                  <Loader2 :size="14" class="animate-spin" />
                  设备守护进程初始化中，{{ domain.label }} 方法暂不可调用…
                </div>
                <div class="mt-3 grid gap-2">
                  <div v-for="i in domain.methods.length" :key="i" class="h-12 animate-pulse rounded-md bg-accent" />
                </div>
              </div>
              <div v-else class="flex flex-col gap-3">
                <MethodRunner
                  v-for="method in domain.methods"
                  :key="method.name"
                  :domain="domain.name"
                  :method="method"
                  :enabled="available.has(domain.name) && deviceReady"
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="scenarios" class="p-4">
            <div class="mx-auto flex w-full max-w-6xl flex-col gap-3">
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="mr-1 text-ui-caption text-foreground-subtle">能力域</span>
                <Button
                  v-for="id in SCENARIO_CAPABILITY_IDS"
                  :key="id"
                  size="sm"
                  :variant="scenarioCapability === id ? 'default' : 'outline'"
                  @click="scenarioCapability = id"
                >
                  {{ DIAGNOSTIC_SCENARIOS[id].label }}
                </Button>
              </div>
              <ScenarioRunner :capability-id="scenarioCapability" :enabled="available.has(scenarioCapability) && deviceReady" />
            </div>
          </TabsContent>

          <TabsContent value="platform" class="p-0">
            <PlatformPanel />
          </TabsContent>

          <TabsContent value="insights" class="p-0">
            <DeviceInsights />
          </TabsContent>

          <TabsContent value="config" class="p-0">
            <DeviceConfigPanel />
          </TabsContent>
        </div>

        <div class="hidden w-80 shrink-0 border-l border-border p-4 lg:flex">
          <EventStream class="flex-1" />
        </div>
      </div>
    </Tabs>
  </div>
</template>
