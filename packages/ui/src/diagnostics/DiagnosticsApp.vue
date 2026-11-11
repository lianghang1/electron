<script setup lang="ts">
import { desktop } from '@shell/bridge/client'
import { DIAGNOSTIC_CATALOG } from '@shell/shared'
import { Badge, Button, Tabs, TabsContent, TabsList, TabsTrigger } from '@ui/components/ui'
import {
  Activity,
  Camera,
  CreditCard,
  IdCard,
  MonitorCog,
  PenLine,
  Printer,
  RefreshCw,
  ScanLine,
  Settings2,
} from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import DeviceConfigPanel from './DeviceConfigPanel.vue'
import DeviceInsights from './DeviceInsights.vue'
import EventStream from './EventStream.vue'
import MethodRunner from './MethodRunner.vue'
import PlatformPanel from './PlatformPanel.vue'

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
}

const ICONS = { Camera, IdCard, CreditCard, PenLine, ScanLine, Printer }

const info = ref<ShellInfo | null>(null)
const loadError = ref('')
const active = ref('capture')
const domains = DIAGNOSTIC_CATALOG
const clock = ref('')

const available = computed(() => new Set(info.value?.capabilities.availableDomains ?? []))
const enabledCount = computed(() => domains.filter(d => available.value.has(d.name)).length)

async function loadInfo() {
  loadError.value = ''
  try {
    info.value = await desktop().shell.info() as ShellInfo
    clock.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  }
  catch (err) {
    loadError.value = err instanceof Error ? err.message : String(err)
  }
}

onMounted(loadInfo)
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
      <TabsList>
        <TabsTrigger v-for="domain in domains" :key="domain.name" :value="domain.name">
          <component :is="ICONS[domain.icon as keyof typeof ICONS]" :size="14" class="mr-1.5 inline" />
          {{ domain.label }}
          <span v-if="!available.has(domain.name)" class="ml-1 text-ui-xs text-foreground-subtle">· 未启用</span>
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
            <div class="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col gap-3">
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
              <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-auto pr-1">
                <MethodRunner
                  v-for="method in domain.methods"
                  :key="method.name"
                  :domain="domain.name"
                  :method="method"
                  :enabled="available.has(domain.name)"
                />
              </div>
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
