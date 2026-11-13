<script setup lang="ts">
import type { DownloadTask } from '@shell/shared'
import { shell } from '@shell/bridge/client'
import { Badge, Button } from '@ui/components/ui'
import { Check, Download, FolderOpen, X } from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const tasks = ref<DownloadTask[]>([])
let unsubscribe: (() => void) | undefined

const visible = computed(() => tasks.value.length > 0)

onMounted(async () => {
  tasks.value = await shell().downloads.list() as DownloadTask[]
  unsubscribe = shell().onEvent('download.tasks-changed', (payload) => {
    const data = payload as { tasks?: DownloadTask[] } | null
    if (data && Array.isArray(data.tasks)) { tasks.value = data.tasks }
  })
})

onBeforeUnmount(() => { unsubscribe?.() })

function statusLabel(task: DownloadTask): string {
  switch (task.status) {
    case 'completed': return '已完成'
    case 'cancelled': return '已取消'
    case 'failed': return '失败'
    case 'interrupted': return '已中断'
    default: return task.percent < 0 ? '下载中' : `${String(task.percent)}%`
  }
}

function isTerminal(task: DownloadTask): boolean {
  return task.status !== 'progressing'
}

async function act(fn: () => Promise<unknown>): Promise<void> {
  try { await fn() }
  catch { /* 单条操作失败由主进程落日志，横幅不因此消失 */ }
}
</script>

<template>
  <div
    v-if="visible"
    class="absolute bottom-3 right-3 z-20 w-80 overflow-hidden rounded-md border border-border bg-card shadow-card"
  >
    <div class="flex items-center justify-between border-b border-border px-3 py-2">
      <span class="flex items-center gap-1.5 text-ui-sm font-medium text-foreground">
        <Download :size="14" /> 下载
      </span>
      <span class="text-ui-xs text-foreground-subtle">{{ tasks.length }} 项</span>
    </div>

    <div class="max-h-56 overflow-y-auto">
      <div
        v-for="task in tasks"
        :key="task.id"
        class="border-b border-border px-3 py-2.5 last:border-b-0"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0 flex-1">
            <p class="truncate text-ui-sm text-foreground" :title="task.filename">
              {{ task.filename }}
            </p>
            <p class="mt-0.5 truncate text-ui-xs text-foreground-subtle">
              {{ task.appId }}
            </p>
          </div>
          <Badge :variant="task.status === 'completed' ? 'default' : 'secondary'" class="shrink-0">
            {{ statusLabel(task) }}
          </Badge>
        </div>

        <div v-if="task.status === 'progressing'" class="mt-2 h-1 overflow-hidden rounded-full bg-border">
          <div
            class="h-full bg-primary transition-all"
            :style="{ width: `${String(Math.max(0, task.percent))}%` }"
          />
        </div>

        <div class="mt-2 flex items-center gap-1">
          <Button
            v-if="!isTerminal(task)"
            size="xs"
            variant="ghost"
            @click="act(() => shell().downloads.cancel(task.id))"
          >
            取消
          </Button>
          <template v-if="task.status === 'completed'">
            <Button size="xs" variant="ghost" @click="act(() => shell().downloads.open(task.id))">
              <Check :size="13" /> 打开
            </Button>
            <Button size="xs" variant="ghost" @click="act(() => shell().downloads.reveal(task.id))">
              <FolderOpen :size="13" /> 定位
            </Button>
          </template>
          <Button
            v-if="isTerminal(task)"
            size="xs"
            variant="ghost"
            aria-label="移除下载记录"
            @click="act(() => shell().downloads.dismiss(task.id))"
          >
            <X :size="13" />
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
