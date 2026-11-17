<script setup lang="ts">
import type { DownloadTask } from '@shell/shared'
import type { Component } from 'vue'
import type { NotificationItem } from '../../overlay/types'
import { AlertCircle, AlertTriangle, Bell, Check, Download, FileText, X } from '@lucide/vue'
import { formatBytes } from '@shell/shared'
import { Button, Progress } from '@ui/components'
import { onBeforeUnmount, onMounted, watch } from 'vue'

/**
 * 通知/下载 toast 堆叠：右上角顶栏之下，kernel 上限封顶，不内部滚动。
 * 纯展示：悬停穿透协商与全部动作经事件上抛。
 */
const props = defineProps<{
  notifications: NotificationItem[]
  downloads: DownloadTask[]
}>()

const emit = defineEmits<{
  hover: [hovering: boolean]
  dismissNotification: [id: string]
  clearNotifications: []
  dismissDownload: [taskId: string]
  openDownload: [taskId: string]
  revealDownload: [taskId: string]
}>()

/**
 * 悬停拦截协商：卡片移除（关闭/TTL/清空）不触发 mouseleave（元素已消失），
 * 列表变化后用最后指针位置探测——已不在卡片上则归还穿透，防拦截滞留
 */
let hoverHeld = false
let lastPointer: { x: number, y: number } | null = null
function hover(holding: boolean): void {
  hoverHeld = holding
  emit('hover', holding)
}
function onPointerTrack(e: MouseEvent): void {
  lastPointer = { x: e.clientX, y: e.clientY }
}
onMounted(() => {
  document.addEventListener('mousemove', onPointerTrack, { passive: true, capture: true })
})
onBeforeUnmount(() => {
  document.removeEventListener('mousemove', onPointerTrack, true)
  // 组件卸载（全部卡片离场）时拦截必须归还，否则 plane 永久收全量鼠标
  if (hoverHeld) { hover(false) }
})
watch(() => props.notifications.length + props.downloads.length, () => {
  if (!hoverHeld || !lastPointer) { return }
  const el = document.elementFromPoint(lastPointer.x, lastPointer.y)
  if (!el?.closest('.bg-popover')) { hover(false) }
}, { flush: 'post' })

/** 下载卡中文状态（master STATUS_TEXT 语义） */
const statusText: Record<string, string> = {
  progressing: '下载中',
  completed: '已完成',
  cancelled: '已取消',
  interrupted: '已中断',
  failed: '已失败',
}

/** 通知级别章：软色底 + 语义图标，未识别级别回退 info（状态色走 Tailwind 默认色阶） */
const chipInfo = { icon: Bell, class: 'bg-accent text-accent-foreground' } as const
const levelChip: Record<string, { icon: Component, class: string }> = {
  info: chipInfo,
  success: { icon: Check, class: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  warning: { icon: AlertTriangle, class: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
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
    appear
    tag="div"
    name="plane-toast"
    class="pointer-events-none absolute right-4 top-13 z-10 flex w-80 flex-col gap-2"
  >
    <div
      v-for="task in downloads"
      :key="task.id"
      class="group pointer-events-auto relative flex gap-2 rounded-xl bg-popover p-3 shadow-lg"
      :title="task.path"
      @mouseenter="hover(true)"
      @mouseleave="hover(false)"
    >
      <span class="mt-0.5 flex size-6 flex-none items-center justify-center rounded-lg" :class="task.status === 'completed' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-accent text-accent-foreground'">
        <component :is="task.status === 'completed' ? FileText : Download" :size="13" />
      </span>
      <div class="min-w-0 flex-1">
        <div class="flex items-baseline gap-2 pr-4">
          <span class="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{{ task.filename }}</span>
          <span class="flex-none text-xs text-muted-foreground">
            {{ statusText[task.status] ?? task.status }}<template v-if="task.status === 'progressing' && task.percent >= 0"> · {{ task.percent }}%</template><template v-if="task.total > 0"> · {{ formatBytes(task.total) }}</template>
          </span>
        </div>
        <div
          v-if="task.status === 'progressing' && task.percent >= 0"
          class="mt-1.5 h-0.5"
        >
          <Progress :model-value="task.percent" class="h-0.5" />
        </div>
        <div v-if="task.status === 'completed'" class="mt-1.5 flex gap-1">
          <Button variant="ghost" size="xs" class="h-auto px-1.5 py-0.5 text-xs text-primary" @click="$emit('openDownload', task.id)">
            打开
          </Button>
          <Button variant="ghost" size="xs" class="h-auto px-1.5 py-0.5 text-xs text-primary" @click="$emit('revealDownload', task.id)">
            文件夹
          </Button>
        </div>
      </div>
      <Button variant="ghost" size="icon-xs" class="absolute top-2 right-2" aria-label="关闭下载卡" @click="$emit('dismissDownload', task.id)">
        <X />
      </Button>
    </div>
    <div
      v-for="item in notifications"
      :key="item.id"
      class="pointer-events-auto group relative flex gap-2 rounded-xl bg-popover p-3 shadow-lg"
      @mouseenter="hover(true)"
      @mouseleave="hover(false)"
    >
      <span class="mt-0.5 flex size-6 flex-none items-center justify-center rounded-lg" :class="levelChipOf(item.level).class">
        <component :is="levelChipOf(item.level).icon" :size="13" />
      </span>
      <div class="min-w-0 flex-1 pr-4">
        <div class="flex items-baseline gap-2">
          <span class="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{{ item.title }}</span>
          <span class="flex-none text-xs text-muted-foreground">{{ relativeTime(item.createdAt) }}</span>
        </div>
        <div v-if="item.appName || item.body" class="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
          {{ item.appName }}<template v-if="item.appName && item.body">
            ·
          </template>{{ item.body }}
        </div>
      </div>
      <Button variant="ghost" size="icon-xs" class="absolute top-2 right-2" aria-label="关闭通知" @click="$emit('dismissNotification', item.id)">
        <X />
      </Button>
    </div>
    <div
      v-if="notifications.length > 1"
      key="clear-all"
      class="pointer-events-auto flex justify-end"
      @mouseenter="hover(true)"
      @mouseleave="hover(false)"
    >
      <!-- outline 变体的 dark:bg-input/30 近透明底在透明 plane 上成白底白字，
           改用与卡片同语言的 popover 实底芯片承载 ghost 按钮 -->
      <div class="flex rounded-xl border border-border bg-popover p-1 shadow-lg">
        <Button variant="ghost" size="xs" @click="$emit('clearNotifications')">
          全部清除
        </Button>
      </div>
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
