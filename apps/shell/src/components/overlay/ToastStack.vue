<script setup lang="ts">
import type { DownloadTask } from '@shell/shared'
import type { Component } from 'vue'
import type { NotificationItem } from '../../composables/use-overlay-state'
import { formatBytes } from '@shell/shared'
import { AlertCircle, AlertTriangle, Bell, Check, Download, FileText, X } from 'lucide-vue-next'

/**
 * 通知/下载 toast 堆叠：右上角顶栏之下，kernel 上限封顶，不内部滚动。
 * 纯展示：悬停穿透协商与全部动作经事件上抛。
 */
defineProps<{
  notifications: NotificationItem[]
  downloads: DownloadTask[]
}>()

defineEmits<{
  hover: [hovering: boolean]
  dismissNotification: [id: string]
  clearNotifications: []
  dismissDownload: [taskId: string]
  openDownload: [taskId: string]
  revealDownload: [taskId: string]
}>()

/** 下载卡中文状态（master STATUS_TEXT 语义） */
const statusText: Record<string, string> = {
  progressing: '下载中',
  completed: '已完成',
  cancelled: '已取消',
  interrupted: '已中断',
  failed: '已失败',
}

/** 通知级别章：软色底 + 语义图标，未识别级别回退 info */
const chipInfo = { icon: Bell, class: 'bg-accent text-accent-foreground' } as const
const levelChip: Record<string, { icon: Component, class: string }> = {
  info: chipInfo,
  success: { icon: Check, class: 'bg-ok/15 text-ok' },
  warning: { icon: AlertTriangle, class: 'bg-warn/15 text-warn' },
  error: { icon: AlertCircle, class: 'bg-destructive/15 text-destructive' },
}

function levelChipOf(level: string): { icon: Component, class: string } {
  return levelChip[level] ?? chipInfo
}

/** 相对时间：一分钟内「刚刚」，一小时内按分钟，更早退回 HH:mm */
function relativeTime(ts?: number): string {
  if (!ts) { return '' }
  const diff = Date.now() - ts
  if (diff < 60_000) { return '刚刚' }
  if (diff < 3_600_000) { return `${Math.floor(diff / 60_000)} 分钟前` }
  return new Date(ts).toTimeString().slice(0, 5)
}
</script>

<template>
  <TransitionGroup
    tag="div"
    name="plane-toast"
    class="pointer-events-none absolute right-4 top-13 z-10 flex w-80 flex-col gap-2"
  >
    <div
      v-for="task in downloads"
      :key="task.id"
      class="group pointer-events-auto relative flex gap-2 rounded-xl bg-popover p-3 shadow-float"
      :title="task.path"
      @mouseenter="$emit('hover', true)"
      @mouseleave="$emit('hover', false)"
    >
      <span class="mt-0.5 flex size-6 flex-none items-center justify-center rounded-lg" :class="task.status === 'completed' ? 'bg-ok/15 text-ok' : 'bg-accent text-accent-foreground'">
        <component :is="task.status === 'completed' ? FileText : Download" :size="13" />
      </span>
      <div class="min-w-0 flex-1">
        <div class="flex items-baseline gap-2 pr-4">
          <span class="min-w-0 flex-1 truncate text-ui-caption font-semibold text-foreground">{{ task.filename }}</span>
          <span class="flex-none text-ui-xs text-foreground-subtle">
            {{ statusText[task.status] ?? task.status }}<template v-if="task.status === 'progressing' && task.percent >= 0"> · {{ task.percent }}%</template><template v-if="task.total > 0"> · {{ formatBytes(task.total) }}</template>
          </span>
        </div>
        <div
          v-if="task.status === 'progressing' && task.percent >= 0"
          class="mt-1.5 h-0.5 overflow-hidden rounded-full bg-hover"
        >
          <div class="h-full rounded-full bg-primary transition-[width] duration-200" :style="{ width: `${task.percent}%` }" />
        </div>
        <div v-if="task.status === 'completed'" class="mt-1.5 flex gap-1">
          <button class="rounded-md px-1.5 py-0.5 text-ui-xs font-medium text-primary transition-colors hover:bg-hover" @click="$emit('openDownload', task.id)">
            打开
          </button>
          <button class="rounded-md px-1.5 py-0.5 text-ui-xs font-medium text-primary transition-colors hover:bg-hover" @click="$emit('revealDownload', task.id)">
            文件夹
          </button>
        </div>
      </div>
      <button class="absolute right-2 top-2 text-foreground-subtle opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-100" aria-label="关闭下载卡" @click="$emit('dismissDownload', task.id)">
        <X :size="12" />
      </button>
    </div>
    <div
      v-for="item in notifications"
      :key="item.id"
      class="pointer-events-auto group relative flex gap-2 rounded-xl bg-popover p-3 shadow-float"
      @mouseenter="$emit('hover', true)"
      @mouseleave="$emit('hover', false)"
    >
      <span class="mt-0.5 flex size-6 flex-none items-center justify-center rounded-lg" :class="levelChipOf(item.level).class">
        <component :is="levelChipOf(item.level).icon" :size="13" />
      </span>
      <div class="min-w-0 flex-1 pr-4">
        <div class="flex items-baseline gap-2">
          <span class="min-w-0 flex-1 truncate text-ui-caption font-semibold text-foreground">{{ item.title }}</span>
          <span class="flex-none text-ui-xs text-foreground-subtle">{{ relativeTime(item.createdAt) }}</span>
        </div>
        <div v-if="item.appName || item.body" class="mt-0.5 line-clamp-2 text-ui-xs text-muted-foreground">
          {{ item.appName }}<template v-if="item.appName && item.body">
            ·
          </template>{{ item.body }}
        </div>
      </div>
      <button class="absolute right-2 top-2 text-foreground-subtle opacity-0 transition-opacity group-hover:opacity-100" aria-label="关闭通知" @click="$emit('dismissNotification', item.id)">
        <X :size="12" />
      </button>
    </div>
    <div
      v-if="notifications.length > 1"
      key="clear-all"
      class="pointer-events-auto flex justify-end"
      @mouseenter="$emit('hover', true)"
      @mouseleave="$emit('hover', false)"
    >
      <button class="rounded-md bg-popover px-2 py-1 text-ui-xs font-medium text-primary shadow-float transition-colors hover:bg-hover" @click="$emit('clearNotifications')">
        全部清除
      </button>
    </div>
  </TransitionGroup>
</template>

<style>
/* plane 内 toast 进出场：纯 CSS 过渡，显隐零握手 */
.plane-toast-enter-active,
.plane-toast-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.plane-toast-enter-from,
.plane-toast-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
.plane-toast-move {
  transition: transform 0.18s ease;
}
</style>
