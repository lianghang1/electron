<script setup lang="ts">
import type { DownloadTask } from '@desktop/shared'
import { formatBytes, useDownloads } from '../composables/use-downloads'

const { tasks } = useDownloads()

const STATUS_TEXT: Record<DownloadTask['status'], string> = {
  progressing: '下载中',
  completed: '已完成',
  cancelled: '已取消',
  interrupted: '已中断',
}
</script>

<template>
  <!-- 底部下载横幅：与权限横幅同为 .dt-main 弹性布局成员，出现时 viewport 自动收缩 -->
  <TransitionGroup v-if="tasks.length > 0" tag="div" name="dl" class="dl-banner">
    <div v-for="task in tasks" :key="task.id" class="dl-row">
      <span class="dl-dot" :class="`dl-dot--${task.status}`" />
      <div class="dl-info">
        <span class="dl-title" :title="task.path">{{ task.filename }}</span>
        <span class="dl-desc">
          {{ STATUS_TEXT[task.status] }}
          <template v-if="task.percent >= 0 && task.status === 'progressing'">
            · {{ task.percent }}%
          </template>
          <template v-if="task.total > 0"> · {{ formatBytes(task.total) }}</template>
        </span>
      </div>
      <div v-if="task.status === 'progressing' && task.percent >= 0" class="dl-track">
        <div class="dl-bar" :style="{ width: `${task.percent}%` }" />
      </div>
    </div>
  </TransitionGroup>
</template>

<style scoped>
.dl-banner {
  flex: none;
  background: #ffffff;
  border-top: 1px solid #e5e7eb;
}
.dl-row {
  display: flex;
  align-items: center;
  height: 52px;
  padding: 0 16px;
}
.dl-row + .dl-row {
  border-top: 1px solid #f3f4f6;
}
.dl-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 12px;
  flex: none;
  background: #94a3b8;
}
.dl-dot--progressing {
  background: #3370ff;
}
.dl-dot--completed {
  background: #16a34a;
}
.dl-dot--interrupted,
.dl-dot--cancelled {
  background: #dc2626;
}
.dl-info {
  width: 280px;
  flex: none;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.dl-title {
  font-size: 13px;
  font-weight: 600;
  color: #1f2328;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dl-desc {
  font-size: 12px;
  color: #6b7280;
}
.dl-track {
  flex: 1;
  height: 4px;
  margin-left: 16px;
  border-radius: 2px;
  background: #f1f5f9;
  overflow: hidden;
}
.dl-bar {
  height: 100%;
  border-radius: 2px;
  background: #3370ff;
  transition: width 0.3s ease;
}

.dl-enter-active,
.dl-leave-active {
  transition: all 0.2s ease;
}
.dl-enter-from,
.dl-leave-to {
  opacity: 0;
  transform: translateY(12px);
}
</style>
