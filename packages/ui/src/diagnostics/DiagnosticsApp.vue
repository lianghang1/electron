<script setup lang="ts">
import type { DeviceCapabilityId } from '@shell/shared'
import { desktop } from '@shell/bridge/client'
import { DIAGNOSTIC_CATALOG, DIAGNOSTIC_SCENARIOS, SCENARIO_CAPABILITY_IDS } from '@shell/shared'
import { Badge, Button } from '@ui/components/ui'
import {
  Activity,
  Camera,
  CreditCard,
  FlaskConical,
  IdCard,
  Loader2,
  MonitorCog,
  PanelRight,
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

interface NavItem {
  id: string
  label: string
  icon: unknown
}

const info = ref<ShellInfo | null>(null)
const loadError = ref('')
const active = ref('capture')
const scenarioCapability = ref<DeviceCapabilityId>('print')
const domains = DIAGNOSTIC_CATALOG
const clock = ref('')
const eventOpen = ref(true)
// 启动门禁：守护进程预热完成前，设备相关入口进入「初始化中」过渡态而非可点状态
// （快照取 shell.info 的 deviceHostReady，就绪事件 devices.ready 即时解除）
const deviceReady = ref(false)

const available = computed(() => new Set(info.value?.capabilities.availableDomains ?? []))
const enabledCount = computed(() => domains.filter(d => available.value.has(d.name)).length)

/** 侧边导航两个分组：设备域 + 验机与工具，替代原先 10 个横排 tab */
const domainNav: NavItem[] = domains.map(d => ({ id: d.name, label: d.label, icon: ICONS[d.icon as keyof typeof ICONS] }))
const toolNav: NavItem[] = [
  { id: 'scenarios', label: '场景验机', icon: FlaskConical },
  { id: 'platform', label: '平台自检', icon: MonitorCog },
  { id: 'insights', label: '运行观测', icon: Activity },
  { id: 'config', label: '设备配置', icon: Settings2 },
]

const activeLabel = computed(() =>
  [...domainNav, ...toolNav].find(item => item.id === active.value)?.label ?? '',
)

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

/** 域导航状态点：就绪 / 初始化中 / 未启用 */
function domainDot(id: string): { cls: string, tip: string } {
  if (!available.value.has(id)) { return { cls: 'bg-foreground-subtle', tip: '未启用' } }
  if (!deviceReady.value) { return { cls: 'bg-amber-500 animate-pulse', tip: '初始化中' } }
  return { cls: 'bg-ok', tip: '就绪' }
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
  <div class="flex h-full min-h-0 w-full bg-background text-foreground">
    <!-- 左侧导航：设备域与工具分两组，窄屏收成图标栏 -->
    <aside class="flex w-14 shrink-0 flex-col border-r border-border bg-card lg:w-52">
      <div class="hidden px-4 pb-1 pt-4 lg:block">
        <h1 class="text-ui-base font-semibold text-foreground">
          系统功能检测
        </h1>
        <p class="mt-0.5 text-ui-caption text-muted-foreground">
          硬件域调用与平台自检
        </p>
      </div>
      <nav class="flex-1 overflow-y-auto px-2 py-2" aria-label="诊断台导航">
        <p class="px-2 pb-1 pt-2 text-ui-xs font-medium text-foreground-subtle lg:px-2">
          设备域
        </p>
        <button
          v-for="item in domainNav"
          :key="item.id"
          class="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors"
          :class="active === item.id ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/60'"
          :aria-current="active === item.id ? 'page' : undefined"
          :title="item.label"
          @click="active = item.id"
        >
          <component :is="item.icon" :size="16" class="mx-auto shrink-0 lg:mx-0" />
          <span class="hidden min-w-0 flex-1 truncate text-ui-sm lg:inline">{{ item.label }}</span>
          <span
            class="size-1.5 shrink-0 rounded-full"
            :class="domainDot(item.id).cls"
            :title="domainDot(item.id).tip"
          />
        </button>
        <p class="px-2 pb-1 pt-4 text-ui-xs font-medium text-foreground-subtle">
          验机与工具
        </p>
        <button
          v-for="item in toolNav"
          :key="item.id"
          class="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors"
          :class="active === item.id ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/60'"
          :aria-current="active === item.id ? 'page' : undefined"
          :title="item.label"
          @click="active = item.id"
        >
          <component :is="item.icon" :size="16" class="mx-auto shrink-0 lg:mx-0" />
          <span class="hidden min-w-0 flex-1 truncate text-ui-sm lg:inline">{{ item.label }}</span>
        </button>
      </nav>
      <div class="hidden px-4 pb-3 text-ui-xs text-foreground-subtle lg:block">
        可用域 {{ enabledCount }} / {{ domains.length }}
      </div>
    </aside>

    <!-- 主区：单行工具栏 + 内容面板 -->
    <div class="flex min-w-0 flex-1 flex-col">
      <header class="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-card px-4">
        <span class="min-w-0 truncate text-ui-sm font-semibold text-foreground">{{ activeLabel }}</span>
        <Badge variant="outline" class="hidden md:inline">
          {{ info?.capabilities.platform ?? '检测中' }}
        </Badge>
        <Badge v-if="!deviceReady" variant="soft" class="gap-1">
          <Loader2 :size="12" class="animate-spin" />设备初始化中
        </Badge>
        <span class="hidden text-ui-xs text-foreground-subtle sm:inline">{{ clock }}</span>
        <div class="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            title="事件流"
            :class="eventOpen ? 'text-accent-foreground' : ''"
            @click="eventOpen = !eventOpen"
          >
            <PanelRight :size="15" />
          </Button>
          <Button variant="ghost" size="icon-sm" title="刷新平台信息" @click="loadInfo">
            <RefreshCw :size="14" />
          </Button>
        </div>
      </header>

      <div v-if="loadError" class="shrink-0 border-b border-destructive bg-background px-5 py-2 text-ui-caption text-destructive">
        平台信息读取失败：{{ loadError }}
      </div>

      <div v-if="info?.capabilities.notes" class="shrink-0 border-b border-border bg-accent px-5 py-1.5 text-ui-caption text-accent-foreground">
        {{ info.capabilities.notes }}
      </div>

      <main class="min-h-0 flex-1 overflow-auto">
        <!-- 设备域面板 -->
        <template v-for="domain in domains" :key="domain.name">
          <div v-if="active === domain.name" class="mx-auto flex w-full max-w-5xl flex-col gap-3 p-4">
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
        </template>

        <div v-if="active === 'scenarios'" class="mx-auto flex w-full max-w-6xl flex-col gap-3 p-4">
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

        <PlatformPanel v-else-if="active === 'platform'" />
        <DeviceInsights v-else-if="active === 'insights'" />
        <DeviceConfigPanel v-else-if="active === 'config'" />
      </main>
    </div>

    <!-- 事件流：可收起；保持挂载，收起期间事件历史不丢 -->
    <div v-show="eventOpen" class="hidden w-72 shrink-0 border-l border-border bg-card p-3 xl:flex">
      <EventStream class="flex-1" />
    </div>
  </div>
</template>
