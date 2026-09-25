<script setup lang="ts">
import type { DesktopTab } from '@desktop/shared'
import { computed } from 'vue'

const props = defineProps<{ tabs: DesktopTab[] }>()

defineEmits<{
  activate: [tabId: string]
  close: [tabId: string]
  reload: [tabId: string]
}>()

const activeTab = computed(() => props.tabs.find(tab => tab.active))
</script>

<template>
  <div class="dt-tabbar">
    <div class="dt-tabbar__tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="dt-tab"
        :class="{ 'dt-tab--active': tab.active }"
        @click="$emit('activate', tab.id)"
      >
        <span class="dt-tab__title">{{ tab.title }}</span>
        <span
          v-if="tab.id === activeTab?.id"
          class="dt-tab__action"
          title="刷新"
          @click.stop="$emit('reload', tab.id)"
        >⟳</span>
        <span class="dt-tab__action" title="关闭" @click.stop="$emit('close', tab.id)">✕</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.dt-tabbar {
  flex: none;
  display: flex;
  align-items: flex-end;
  background: #ffffff;
  border-bottom: 1px solid #e5e7eb;
  padding: 6px 8px 0;
}
.dt-tabbar__tabs {
  display: flex;
  overflow-x: auto;
}
.dt-tab {
  display: flex;
  align-items: center;
  border: 1px solid transparent;
  border-bottom: none;
  border-radius: 8px 8px 0 0;
  background: #f3f4f6;
  padding: 6px 8px 6px 12px;
  margin-right: 4px;
  font-size: 13px;
  color: #4b5563;
  cursor: pointer;
  white-space: nowrap;
  font-family: inherit;
}
.dt-tab--active {
  background: #eef0f3;
  color: #1f2328;
  border-color: #e5e7eb;
}
.dt-tab__title {
  margin-right: 6px;
}
.dt-tab__action {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  font-size: 11px;
  color: #9ca3af;
  margin-left: 2px;
}
.dt-tab__action:hover {
  background: #e5e7eb;
  color: #1f2328;
}
</style>
