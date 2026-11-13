<script setup lang="ts">
import { desktop } from '@shell/bridge/client'
import { Badge, Button, Card, CardContent, CardHeader, Input, Label, Separator, Switch, Textarea } from '@ui/components/ui'
import { Play, RotateCcw, Save, Settings2, TriangleAlert } from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

interface SectionProfile {
  id: string
  factory: Record<string, unknown>
  current: Record<string, unknown>
  overridden: readonly string[]
}

interface ConfigSection {
  capabilityId: string
  label: string
  overridableKeys: readonly string[]
  profiles: readonly SectionProfile[]
}

const sections = ref<ConfigSection[]>([])
const drafts = ref<Record<string, string>>({})
const demoEnabled = ref(false)
const scanCode = ref('DEMO:1234567890')
const scanResult = ref('')
const busy = ref(false)
const error = ref('')
const notice = ref('')
const unsubscribers: (() => void)[] = []

const overriddenCount = computed(() => sections.value.reduce(
  (sum, section) => sum + section.profiles.reduce((n, p) => n + p.overridden.length, 0),
  0,
))

function draftKey(section: ConfigSection, profile: SectionProfile, key: string): string {
  return `${section.capabilityId}::${profile.id}::${key}`
}

function display(value: unknown): string {
  if (value === undefined || value === null) { return '' }
  if (typeof value === 'string') { return value }
  if (typeof value === 'object') { return JSON.stringify(value) }
  return String(value)
}

/** 打印 URL 白名单出厂数组 → 单行展示；空数组显示说明文字 */
function displayOrigins(value: unknown): string {
  return Array.isArray(value) && value.length ? value.join('  ') : '（未放行远程下载）'
}

/** 出厂值提示行：打印 URL 白名单走列表展示，其余按类型原样显示 */
function factoryHint(profile: SectionProfile, key: string): string {
  return key === 'urlOrigins' ? displayOrigins(profile.factory[key]) : (display(profile.factory[key]) || '（空）')
}

/** 编辑框文本按出厂值类型还原：数字 / 布尔 / JSON 结构 / 字符串。 */
function parseValue(text: string, factory: unknown): unknown {
  if (typeof factory === 'number') { return Number(text) }
  if (typeof factory === 'boolean') { return text === 'true' }
  if (typeof factory === 'object' && factory !== null) {
    try { return JSON.parse(text) as unknown }
    catch { return text }
  }
  return text
}

function seed(list: ConfigSection[]): void {
  const next: Record<string, string> = {}
  for (const section of list) {
    for (const profile of section.profiles) {
      for (const key of section.overridableKeys) {
        const current = profile.current[key]
        next[draftKey(section, profile, key)] = key === 'urlOrigins' && Array.isArray(current)
          ? current.map(String).join('\n')
          : display(current)
      }
    }
  }
  drafts.value = next
}

async function reload(): Promise<void> {
  error.value = ''
  try {
    const [snapshot, demo] = await Promise.all([
      desktop().deviceConfig.snapshot() as Promise<ConfigSection[]>,
      desktop().deviceConfig.demoMode(),
    ])
    sections.value = snapshot
    demoEnabled.value = demo
    seed(snapshot)
  }
  catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

async function run(action: () => Promise<void>): Promise<void> {
  if (busy.value) { return }
  busy.value = true
  error.value = ''
  notice.value = ''
  try { await action() }
  catch (err) { error.value = err instanceof Error ? err.message : String(err) }
  finally { busy.value = false }
}

async function save(section: ConfigSection, profile: SectionProfile): Promise<void> {
  await run(async () => {
    const patch: Record<string, unknown> = {}
    for (const key of section.overridableKeys) {
      const text = drafts.value[draftKey(section, profile, key)] ?? ''
      if (key === 'urlOrigins') {
        // 打印 URL 白名单按行编辑：去空行/去重后与出厂值比较，无差异不写覆盖
        const lines = [...new Set(text.split('\n').map(s => s.trim()).filter(Boolean))]
        const factoryLines = Array.isArray(profile.factory[key]) ? (profile.factory[key] as unknown[]).map(String) : []
        if (JSON.stringify(lines) !== JSON.stringify(factoryLines)) { patch[key] = lines }
        continue
      }
      if (text !== display(profile.factory[key])) {
        patch[key] = parseValue(text, profile.factory[key])
      }
    }
    await desktop().deviceConfig.apply(section.capabilityId, profile.id, patch)
    notice.value = `${section.label} / ${profile.id} 已保存并同步到运行时`
    await reload()
  })
}

async function reset(capabilityId?: string): Promise<void> {
  await run(async () => {
    await desktop().deviceConfig.reset(capabilityId)
    notice.value = capabilityId ? '该能力已恢复出厂' : '全部能力参数已恢复出厂'
    await reload()
  })
}

async function persistDemo(value: boolean): Promise<void> {
  await run(async () => {
    demoEnabled.value = await desktop().deviceConfig.setDemoMode(value)
    notice.value = demoEnabled.value ? '扫码演示模式已开启' : '扫码演示模式已关闭'
  })
}

async function simulate(): Promise<void> {
  await run(async () => {
    const result = await desktop().invoke('scanner.simulateScan', { scannedCode: scanCode.value })
    scanResult.value = typeof result === 'string' ? result : JSON.stringify(result)
    notice.value = '已注入一条模拟扫码，事件经 scanner.scanned 广播'
  })
}

onMounted(() => {
  void reload()
  unsubscribers.push(desktop().onEvent('scanner.scanned', (payload) => {
    scanResult.value = typeof payload === 'string' ? payload : JSON.stringify(payload)
  }))
})

onBeforeUnmount(() => {
  for (const off of unsubscribers) { off() }
})
</script>

<template>
  <div class="flex h-full min-h-0 flex-col gap-4 overflow-auto p-4">
    <Card class="shrink-0">
      <CardHeader>
        <div class="flex items-center gap-2">
          <Settings2 :size="16" class="text-primary" />
          <span class="text-ui-base font-semibold text-foreground">设备参数</span>
          <Badge variant="soft">
            {{ sections.length }} 个能力
          </Badge>
          <Badge variant="outline">
            {{ overriddenCount }} 项现场覆盖
          </Badge>
          <Button variant="ghost" size="icon-sm" class="ml-auto" :disabled="busy" @click="reload">
            <RotateCcw :size="14" />
          </Button>
          <Button variant="outline" size="xs" :disabled="busy" @click="reset()">
            全部恢复出厂
          </Button>
        </div>
      </CardHeader>
      <CardContent class="flex flex-col gap-2">
        <p class="text-ui-caption text-muted-foreground">
          出厂档案随代码发布，不落盘；现场只保存与出厂值不同的字段。保存后同步到各域运行时，打印参数作为提交缺省值。
        </p>
        <div v-if="error" class="rounded-md border border-destructive px-3 py-2 text-ui-caption text-destructive">
          <TriangleAlert :size="12" class="mr-1 inline" />{{ error }}
        </div>
        <div v-if="notice" class="rounded-md border border-border bg-accent px-3 py-2 text-ui-caption text-accent-foreground">
          {{ notice }}
        </div>
      </CardContent>
    </Card>

    <Card class="shrink-0">
      <CardHeader>
        <div class="flex items-center gap-2">
          <Play :size="16" class="text-primary" />
          <span class="text-ui-base font-semibold text-foreground">扫码演示模式</span>
          <Badge :variant="demoEnabled ? 'default' : 'outline'" class="ml-1">
            {{ demoEnabled ? '已开启' : '已关闭' }}
          </Badge>
          <Switch v-model="demoEnabled" class="ml-auto" @update:model-value="persistDemo" />
        </div>
      </CardHeader>
      <CardContent class="flex flex-col gap-2">
        <p class="text-ui-caption text-muted-foreground">
          开启后 scanner.simulateScan 注入的条码走与真枪相同的缓冲与广播链路，scanner.scanned 事件可被业务页接收；生产环境保持关闭。
        </p>
        <div class="flex flex-wrap items-end gap-2">
          <div class="flex min-w-48 flex-1 flex-col gap-1">
            <Label>模拟扫码内容</Label>
            <Input v-model="scanCode" placeholder="输入条码内容" />
          </div>
          <Button size="sm" :disabled="busy || !scanCode.trim()" @click="simulate">
            <Play :size="13" />注入扫码
          </Button>
        </div>
        <div v-if="scanResult" class="rounded-md border border-border bg-background p-2 font-mono text-ui-xs text-foreground">
          最近扫码：{{ scanResult }}
        </div>
      </CardContent>
    </Card>

    <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Card v-for="section in sections" :key="section.capabilityId" class="min-w-0">
        <CardHeader>
          <div class="flex items-center gap-2">
            <span class="text-ui-base font-semibold text-foreground">{{ section.label }}</span>
            <Badge variant="outline" class="ml-1">
              {{ section.capabilityId }}
            </Badge>
            <Button variant="ghost" size="xs" class="ml-auto" :disabled="busy" @click="reset(section.capabilityId)">
              恢复出厂
            </Button>
          </div>
        </CardHeader>
        <CardContent class="flex flex-col gap-3">
          <div
            v-for="profile in section.profiles"
            :key="profile.id"
            class="flex flex-col gap-2 rounded-md border border-border bg-background p-3"
          >
            <div class="flex items-center gap-2">
              <span class="font-mono text-ui-xs text-foreground-subtle">{{ profile.id }}</span>
              <Badge v-if="profile.overridden.length" variant="soft">
                {{ profile.overridden.length }} 项覆盖
              </Badge>
              <Button variant="outline" size="xs" class="ml-auto" :disabled="busy" @click="save(section, profile)">
                <Save :size="12" />保存
              </Button>
            </div>
            <Separator v-if="section.overridableKeys.length" />
            <div v-for="fieldKey in section.overridableKeys" :key="fieldKey" class="flex flex-col gap-1">
              <div class="flex items-center gap-2">
                <div class="flex w-40 shrink-0 items-center gap-1">
                  <Label class="truncate font-mono text-ui-xs">{{ fieldKey }}</Label>
                  <Badge v-if="profile.overridden.includes(fieldKey)" variant="outline" class="shrink-0">
                    改
                  </Badge>
                </div>
                <Textarea
                  v-if="fieldKey === 'urlOrigins'"
                  :model-value="drafts[draftKey(section, profile, fieldKey)]"
                  :rows="3"
                  class="min-w-0 flex-1 font-mono text-ui-xs"
                  placeholder="https://print.example.com（一行一条）&#10;* 放行公网；内网主机需显式列出"
                  @update:model-value="drafts[draftKey(section, profile, fieldKey)] = $event"
                />
                <Input
                  v-else
                  v-model="drafts[draftKey(section, profile, fieldKey)]"
                  class="min-w-0 flex-1 font-mono text-ui-xs"
                />
              </div>
              <p class="truncate pl-1 font-mono text-ui-xs text-foreground-subtle">
                出厂 {{ factoryHint(profile, fieldKey) }}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>

    <p v-if="!sections.length && !error" class="py-6 text-center text-ui-caption text-foreground-subtle">
      正在读取设备参数…
    </p>
  </div>
</template>
