<script setup lang="ts">
import type { DiagnosticMethod } from '@shell/shared'
import { desktop } from '@shell/bridge/client'
import { buildDiagnosticInput, diagnosticDefaults } from '@shell/shared'
import { Badge, Button, Input, Label, Select, Switch, Textarea } from '@ui/components/ui'
import { Check, Loader2, Play, TriangleAlert } from 'lucide-vue-next'
import { ref, watch } from 'vue'

const props = defineProps<{
  domain: string
  method: DiagnosticMethod
  enabled: boolean
}>()

const values = ref<Record<string, string | number | boolean>>(diagnosticDefaults(props.method.fields))
const pending = ref(false)
const result = ref<unknown>(undefined)
const error = ref('')
const elapsed = ref(0)
const hasRun = ref(false)

watch(() => props.method, (method) => {
  values.value = diagnosticDefaults(method.fields)
  result.value = undefined
  error.value = ''
  hasRun.value = false
})

async function run() {
  if (pending.value) { return }
  pending.value = true
  error.value = ''
  result.value = undefined
  const started = performance.now()
  try {
    const input = buildDiagnosticInput(props.method.fields, values.value)
    result.value = await desktop().invoke(`${props.domain}.${props.method.name}`, input)
    hasRun.value = true
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
</script>

<template>
  <div class="flex flex-col gap-3 rounded-md border border-border bg-card p-4 shadow-card">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-mono text-ui-base font-semibold text-foreground">{{ domain }}.{{ method.name }}</span>
          <Badge :variant="method.readOnly ? 'soft' : 'outline'" class="shrink-0">
            {{ method.readOnly ? '只读' : '操作' }}
          </Badge>
          <Badge v-if="method.dangerous" variant="outline" class="shrink-0 border-destructive text-destructive">
            破坏性
          </Badge>
          <Badge v-if="method.event" variant="outline" class="shrink-0">
            流式
          </Badge>
        </div>
        <p class="mt-1 text-ui-caption text-muted-foreground">
          {{ method.description }}
        </p>
      </div>
      <Button
        size="sm"
        :variant="method.dangerous ? 'destructive' : 'default'"
        :disabled="!enabled || pending"
        class="shrink-0"
        @click="run"
      >
        <Loader2 v-if="pending" :size="14" class="animate-spin" />
        <Play v-else :size="14" />
        执行
      </Button>
    </div>

    <div v-if="method.fields.length" class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div v-for="field in method.fields" :key="field.key" class="flex flex-col gap-1.5">
        <Label>{{ field.label }}<span v-if="field.required" class="text-destructive"> *</span></Label>
        <Select
          v-if="field.kind === 'select'"
          :model-value="String(values[field.key] ?? '')"
          :options="field.options ?? []"
          @update:model-value="values[field.key] = $event"
        />
        <Textarea
          v-else-if="field.kind === 'textarea' || field.kind === 'json'"
          :model-value="String(values[field.key] ?? '')"
          :rows="field.kind === 'json' ? 3 : 4"
          @update:model-value="values[field.key] = $event"
        />
        <div v-else-if="field.kind === 'boolean'" class="flex h-9 items-center">
          <Switch
            :model-value="Boolean(values[field.key])"
            @update:model-value="values[field.key] = $event"
          />
        </div>
        <Input
          v-else
          :model-value="String(values[field.key] ?? '')"
          :type="field.kind === 'number' ? 'number' : 'text'"
          :placeholder="field.placeholder"
          :min="field.min"
          :max="field.max"
          @update:model-value="values[field.key] = field.kind === 'number' ? Number($event) : $event"
        />
        <span v-if="field.hint" class="text-ui-xs text-foreground-subtle">{{ field.hint }}</span>
      </div>
    </div>

    <div v-if="!enabled" class="flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-ui-caption text-accent-foreground">
      <TriangleAlert :size="14" />
      当前平台未启用该设备域，调用将在路由层被拒绝
    </div>

    <div v-if="hasRun" class="flex flex-col gap-1.5">
      <div class="flex items-center gap-2 text-ui-caption">
        <span v-if="!error" class="inline-flex items-center gap-1 text-ok">
          <Check :size="13" />成功
        </span>
        <span v-else class="inline-flex items-center gap-1 text-destructive">
          <TriangleAlert :size="13" />失败
        </span>
        <span class="text-foreground-subtle">{{ elapsed }} ms</span>
      </div>
      <pre
        v-if="!error"
        class="max-h-52 overflow-auto rounded-md border border-border bg-background p-3 font-mono text-ui-xs text-foreground"
      >{{ JSON.stringify(result ?? null, null, 2) }}</pre>
      <div v-else class="rounded-md border border-destructive bg-background p-3 font-mono text-ui-xs text-destructive">
        {{ error }}
      </div>
    </div>
  </div>
</template>
