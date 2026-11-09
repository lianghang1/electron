<script setup lang="ts">
import { desktop } from '@shell/bridge/client'
import { Badge, Button } from '@ui/components/ui'
import { Radio, Trash2 } from 'lucide-vue-next'
import { onBeforeUnmount, onMounted, ref } from 'vue'

interface StreamEntry {
  id: number
  event: string
  at: string
  summary: string
}

const STREAM_EVENTS = ['capture.frame', 'scanner.scanned', 'signature.stroke'] as const

const entries = ref<StreamEntry[]>([])
const unsubscribe: (() => void)[] = []
let seq = 0

function summarise(payload: unknown): string {
  if (payload === null || payload === undefined) { return String(payload) }
  let text: string
  try { text = JSON.stringify(payload) }
  catch { return String(payload) }
  // 预览帧 base64 很长，只留摘要，避免刷屏
  if (text.length > 220) { return `${text.slice(0, 220)}…（${text.length} 字节）` }
  return text
}

onMounted(() => {
  for (const event of STREAM_EVENTS) {
    unsubscribe.push(desktop().onEvent(event, (payload) => {
      const entry: StreamEntry = {
        id: ++seq,
        event,
        at: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
        summary: summarise(payload),
      }
      entries.value = [entry, ...entries.value].slice(0, 40)
    }))
  }
})

onBeforeUnmount(() => {
  for (const off of unsubscribe) { off() }
})
</script>

<template>
  <div class="flex min-h-0 flex-col rounded-md border border-border bg-card shadow-card">
    <div class="flex items-center gap-2 border-b border-border px-4 py-2.5">
      <Radio :size="15" class="text-primary" />
      <span class="text-ui-sm font-semibold text-foreground">实时事件流</span>
      <Badge variant="outline" class="ml-1">
        {{ entries.length }}
      </Badge>
      <Button variant="ghost" size="xs" class="ml-auto" @click="entries = []">
        <Trash2 :size="13" />清空
      </Button>
    </div>
    <div class="flex min-h-0 flex-1 flex-col gap-1.5 overflow-auto p-3">
      <div v-if="!entries.length" class="py-6 text-center text-ui-caption text-foreground-subtle">
        暂无事件。执行「开始预览」「模拟扫码」「开始会话」后，数据将实时出现在这里。
      </div>
      <div
        v-for="entry in entries"
        :key="entry.id"
        class="flex items-start gap-2 rounded-md bg-background px-2.5 py-2 font-mono text-ui-xs"
      >
        <span class="shrink-0 text-foreground-subtle">{{ entry.at }}</span>
        <Badge variant="soft" class="shrink-0">
          {{ entry.event }}
        </Badge>
        <span class="min-w-0 break-all text-foreground">{{ entry.summary }}</span>
      </div>
    </div>
  </div>
</template>
