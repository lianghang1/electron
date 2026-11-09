<script setup lang="ts">
import { desktop } from '@shell/bridge/client'
import { Badge, Button, Card, CardContent, CardHeader, Input, Label } from '@ui/components/ui'
import { Activity, Check, CircleHelp, Globe, HardDrive, Loader2, ShieldAlert, TriangleAlert } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'

interface ProbeResult {
  state: 'idle' | 'running' | 'ok' | 'warn' | 'fail'
  detail: string
  ms: number
}

interface Probe {
  id: string
  label: string
  description: string
  icon: typeof Activity
  run: () => Promise<{ ok: boolean, detail: string }>
  /** 结果不符合预期时只提示，不算失败 */
  expectReject?: boolean
}

interface EnvRow {
  label: string
  value: string
}

const envRows = ref<EnvRow[]>([])
const results = ref<Record<string, ProbeResult>>({})
const networkUrl = ref('data:text/plain,diagnostics-ok')

function result(id: string): ProbeResult {
  return results.value[id] ?? { state: 'idle', detail: '', ms: 0 }
}

function summarise(value: unknown): string {
  let text: string
  try { text = JSON.stringify(value, null, 2) }
  catch { return String(value) }
  return text.length > 600 ? `${text.slice(0, 600)}…` : text
}

const probes: Probe[] = [
  {
    id: 'shell-info',
    label: '平台信息',
    description: 'shell:info()：版本、形态、chrome 档位、门禁快照',
    icon: Activity,
    run: async () => ({ ok: true, detail: summarise(await desktop().shell.info()) }),
  },
  {
    id: 'apps',
    label: '应用清单',
    description: 'app:list()：当前 flavor 已注册的应用',
    icon: HardDrive,
    run: async () => ({ ok: true, detail: summarise(await desktop().apps.list()) }),
  },
  {
    id: 'settings',
    label: '设置快照',
    description: 'settings:all()：schema 与当前值',
    icon: CircleHelp,
    run: async () => ({ ok: true, detail: summarise(await desktop().settings.all()) }),
  },
  {
    id: 'downloads',
    label: '下载任务',
    description: 'download:list()：受管下载任务账本',
    icon: HardDrive,
    run: async () => ({ ok: true, detail: summarise(await desktop().downloads.list()) }),
  },
  {
    id: 'storage',
    label: '网页存储',
    description: 'localStorage / sessionStorage 读写与 cookie 可用性',
    icon: HardDrive,
    run: async () => {
      const before = Number(localStorage.getItem('diagnostics-counter') ?? '0')
      localStorage.setItem('diagnostics-counter', String(before + 1))
      sessionStorage.setItem('diagnostics-probe', 'ok')
      const cookieWritable = typeof document.cookie === 'string'
      return {
        ok: true,
        detail: summarise({
          localStorageCounter: before + 1,
          sessionStorageProbe: sessionStorage.getItem('diagnostics-probe'),
          cookieAvailable: cookieWritable,
          note: 'app:// 源下 Chromium 不开放 cookie，属平台限制；业务数据请走网页存储',
        }),
      }
    },
  },
  {
    id: 'network',
    label: '网络请求',
    description: '渲染层直发 fetch（默认 data: URL，离线可用）',
    icon: Globe,
    run: async () => {
      const response = await fetch(networkUrl.value)
      const body = await response.text()
      return { ok: response.ok, detail: summarise({ status: response.status, body: body.slice(0, 200) }) }
    },
  },
  {
    id: 'unknown-domain',
    label: '未注册域调用',
    description: '调用不存在的域方法，预期被路由层拒绝',
    icon: ShieldAlert,
    expectReject: true,
    run: async () => {
      try {
        await desktop().invoke('debug.probe', {})
        return { ok: false, detail: '意外成功：未注册域调用不应放行' }
      }
      catch (err) {
        return { ok: true, detail: err instanceof Error ? err.message : String(err) }
      }
    },
  },
  {
    id: 'invalid-input',
    label: '非法入参',
    description: 'print.submit 传空对象，预期 zod 校验拒绝',
    icon: ShieldAlert,
    expectReject: true,
    run: async () => {
      try {
        await desktop().invoke('print.submit', {})
        return { ok: false, detail: '意外成功：非法入参不应放行' }
      }
      catch (err) {
        return { ok: true, detail: err instanceof Error ? err.message : String(err) }
      }
    },
  },
]

const doneCount = computed(() => probes.filter(p => ['ok', 'warn'].includes(result(p.id).state)).length)

onMounted(() => {
  envRows.value = [
    { label: 'UA', value: navigator.userAgent },
    { label: '语言 / 时区', value: `${navigator.language} · ${Intl.DateTimeFormat().resolvedOptions().timeZone}` },
    { label: '屏幕 / DPR', value: `${screen.width}×${screen.height} · ${devicePixelRatio}` },
    { label: '视口', value: `${innerWidth}×${innerHeight}` },
    { label: '网络状态', value: navigator.onLine ? '在线' : '离线' },
    { label: '页面协议', value: location.protocol },
  ]
})

async function runProbe(probe: Probe) {
  if (result(probe.id).state === 'running') { return }
  results.value[probe.id] = { state: 'running', detail: '', ms: 0 }
  const started = performance.now()
  try {
    const outcome = await probe.run()
    const ms = Math.round(performance.now() - started)
    // 每个用例返回的 ok 即「是否符合预期」：预期拒绝的用例在捕获到拒绝时返回 true
    results.value[probe.id] = {
      state: outcome.ok ? 'ok' : 'warn',
      detail: outcome.detail,
      ms,
    }
  }
  catch (err) {
    results.value[probe.id] = {
      state: 'fail',
      detail: err instanceof Error ? err.message : String(err),
      ms: Math.round(performance.now() - started),
    }
  }
}

async function runAll() {
  for (const probe of probes) { await runProbe(probe) }
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col gap-4 overflow-auto p-4">
    <Card class="shrink-0">
      <CardHeader>
        <div class="flex items-center gap-2">
          <Activity :size="16" class="text-primary" />
          <span class="text-ui-base font-semibold text-foreground">运行环境</span>
          <Badge variant="soft" class="ml-auto">
            容器基础信息
          </Badge>
        </div>
      </CardHeader>
      <CardContent class="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        <div v-for="row in envRows" :key="row.label" class="flex min-w-0 gap-3 border-b border-border py-1.5 last:border-0">
          <span class="w-24 shrink-0 text-ui-caption text-muted-foreground">{{ row.label }}</span>
          <span class="min-w-0 break-all font-mono text-ui-xs text-foreground">{{ row.value }}</span>
        </div>
      </CardContent>
    </Card>

    <Card class="flex min-h-0 flex-1 flex-col">
      <CardHeader>
        <div class="flex items-center gap-2">
          <ShieldAlert :size="16" class="text-primary" />
          <span class="text-ui-base font-semibold text-foreground">平台自检</span>
          <Badge variant="outline" class="ml-1">
            {{ doneCount }} / {{ probes.length }}
          </Badge>
          <Button variant="outline" size="xs" class="ml-auto" @click="runAll">
            全部执行
          </Button>
        </div>
      </CardHeader>
      <CardContent class="flex flex-col gap-3">
        <div class="flex items-end gap-2 rounded-md bg-accent px-3 py-2">
          <div class="flex flex-1 flex-col gap-1">
            <Label>网络请求地址</Label>
            <Input v-model="networkUrl" placeholder="https://… 或 data: URL" />
          </div>
        </div>

        <div
          v-for="probe in probes"
          :key="probe.id"
          class="flex flex-col gap-2 rounded-md border border-border bg-background p-3"
        >
          <div class="flex items-start gap-2">
            <component :is="probe.icon" :size="15" class="mt-0.5 shrink-0 text-primary" />
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-ui-sm font-semibold text-foreground">{{ probe.label }}</span>
                <Badge v-if="probe.expectReject" variant="outline" class="shrink-0">
                  预期拒绝
                </Badge>
                <span v-if="result(probe.id).ms" class="text-ui-xs text-foreground-subtle">{{ result(probe.id).ms }} ms</span>
                <Check v-if="result(probe.id).state === 'ok'" :size="14" class="text-ok" />
                <TriangleAlert v-else-if="result(probe.id).state === 'warn'" :size="14" class="text-warn" />
                <TriangleAlert v-else-if="result(probe.id).state === 'fail'" :size="14" class="text-destructive" />
              </div>
              <p class="mt-0.5 text-ui-caption text-muted-foreground">
                {{ probe.description }}
              </p>
            </div>
            <Button
              variant="outline"
              size="xs"
              :disabled="result(probe.id).state === 'running'"
              class="shrink-0"
              @click="runProbe(probe)"
            >
              <Loader2 v-if="result(probe.id).state === 'running'" :size="13" class="animate-spin" />
              执行
            </Button>
          </div>
          <pre
            v-if="result(probe.id).detail"
            class="max-h-44 overflow-auto rounded-md border border-border bg-card p-2.5 font-mono text-ui-xs text-foreground"
          >{{ result(probe.id).detail }}</pre>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
