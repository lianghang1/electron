<script setup lang="ts">
import type { DownloadTask } from '@desktop/shared'
import { computed, ref, watch } from 'vue'
import { formatBytes, useDownloads } from '../composables/use-downloads'

const { tasks } = useDownloads()

const STATUS_TEXT: Record<DownloadTask['status'], string> = {
  progressing: '下载中',
  completed: '已完成',
  cancelled: '已取消',
  interrupted: '已中断',
}

/** 用户手动收起；新任务出现时自动恢复显示 */
const dismissed = ref(false)
const visible = computed(() => !dismissed.value && tasks.value.length > 0)

const knownIds = new Set<string>()
watch(tasks, (list) => {
  for (const task of list) {
    if (!knownIds.has(task.id)) {
      knownIds.add(task.id)
      dismissed.value = false
    }
  }
})
</script>

<template>
  <!-- 下载浮窗：角落悬浮（fixed），不参与布局、不挤压内容区；任务清空后自动消失 -->
  <Transition name="dl-pop">
    <div v-if="visible" class="dl-popup">
      <div class="dl-popup__head">
        <span class="dl-popup__title">下载</span>
        <button class="dl-popup__close" title="收起" @click="dismissed = true">
          <svg viewBox="0 0 10 10" width="8" height="8"><path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" /></svg>
        </button>
      </div>
      <div v-for="task in tasks" :key="task.id" class="dl-row" :title="task.path">
        <span class="dl-dot" :class="`dl-dot--${task.status}`" />
        <div class="dl-info">
          <span class="dl-name">{{ task.filename }}</span>
          <span class="dl-desc">
            {{ STATUS_TEXT[task.status] }}
            <template v-if="task.status === 'progressing' && task.percent >= 0"> · {{ task.percent }}%</template>
            <template v-if="task.total > 0"> · {{ formatBytes(task.total) }}</template>
          </span>
        </div>
        <div v-if="task.status === 'progressing' && task.percent >= 0" class="dl-track">
          <div class="dl-bar" :style="{ width: `${task.percent}%` }" />
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.dl-popup {
  position: fixed;
  right: 12px;
  bottom: 12px;
  z-index: 60;
  width: 320px;
  background: var(--dt-surface);
  border: 1px solid var(--dt-line);
  border-radius: var(--dt-radius-3);
  box-shadow: var(--dt-shadow-menu);
  overflow: hidden;
  transition: background var(--dt-dur) var(--dt-ease), border-color var(--dt-dur) var(--dt-ease);
}
.dl-popup__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px 6px;
}
.dl-popup__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--dt-text-2);
}
.dl-popup__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: var(--dt-radius-1);
  background: transparent;
  color: var(--dt-text-3);
  cursor: pointer;
  transition: background var(--dt-dur) var(--dt-ease), color var(--dt-dur) var(--dt-ease);
}
.dl-popup__close:hover {
  background: var(--dt-hover);
  color: var(--dt-text);
}
.dl-row {
  display: flex;
  align-items: center;
  padding: 8px 12px;
}
.dl-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 10px;
  flex: none;
  background: var(--dt-text-3);
}
.dl-dot--progressing {
  background: var(--dt-brand);
}
.dl-dot--completed {
  background: var(--dt-success);
}
.dl-dot--interrupted,
.dl-dot--cancelled {
  background: var(--dt-danger);
}
.dl-info {
  width: 210px;
  flex: none;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.dl-name {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--dt-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dl-desc {
  font-size: 11.5px;
  color: var(--dt-text-2);
}
.dl-track {
  flex: 1;
  height: 4px;
  margin-left: 12px;
  border-radius: 2px;
  background: var(--dt-hover);
  overflow: hidden;
}
.dl-bar {
  height: 100%;
  border-radius: 2px;
  background: var(--dt-brand);
  transition: width var(--dt-dur) var(--dt-ease);
}

.dl-pop-enter-active,
.dl-pop-leave-active {
  transition: opacity 0.2s var(--dt-ease), transform 0.2s var(--dt-ease);
}
.dl-pop-enter-from,
.dl-pop-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
