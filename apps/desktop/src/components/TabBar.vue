<script setup lang="ts">
import type { DesktopTab } from '@desktop/shared'
import { computed } from 'vue'

const props = defineProps<{
  tabs: DesktopTab[]
  /** 窗口最大化状态：切换最大化按钮图标 */
  maximized?: boolean
  /** 应用中心面板展开态：入口按钮高亮 */
  appCenterOpen?: boolean
}>()

defineEmits<{
  activate: [tabId: string]
  close: [tabId: string]
  reload: [tabId: string]
  toggleCenter: []
  minimize: []
  toggleMaximize: []
  closeWindow: []
}>()

const activeTab = computed(() => props.tabs.find(tab => tab.active))
</script>

<template>
  <!-- 沉浸式顶栏（飞书式）：品牌 / 应用中心 / Tab / 窗口控制合一，
       整栏为窗口拖拽区，可交互控件一律 no-drag -->
  <div class="dt-topbar">
    <div class="dt-topbar__brand">
      Desktop
    </div>
    <button
      class="dt-topbar__center"
      :class="{ 'dt-topbar__center--open': appCenterOpen }"
      title="应用中心"
      @click="$emit('toggleCenter')"
    >
      应用中心
    </button>

    <div class="dt-topbar__tabs">
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

    <div class="dt-topbar__spacer" />

    <div class="dt-topbar__controls">
      <button class="dt-winbtn" title="最小化" @click="$emit('minimize')">
        ─
      </button>
      <button class="dt-winbtn" :title="maximized ? '还原' : '最大化'" @click="$emit('toggleMaximize')">
        {{ maximized ? '❐' : '□' }}
      </button>
      <button class="dt-winbtn dt-winbtn--close" title="关闭" @click="$emit('closeWindow')">
        ✕
      </button>
    </div>
  </div>
</template>

<style scoped>
.dt-topbar {
  height: 40px;
  flex: none;
  display: flex;
  align-items: center;
  background: #ffffff;
  border-bottom: 1px solid #e7e9ec;
  padding-left: 12px;
  -webkit-app-region: drag;
}
.dt-topbar__brand {
  font-size: 13px;
  font-weight: 600;
  color: #1f2328;
  margin-right: 8px;
}
.dt-topbar__center {
  border: none;
  background: transparent;
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12px;
  color: #6b7280;
  cursor: pointer;
  font-family: inherit;
  -webkit-app-region: no-drag;
}
.dt-topbar__center:hover {
  background: #f2f3f5;
  color: #1f2328;
}
.dt-topbar__center--open {
  background: #3370ff;
  color: #ffffff;
}
.dt-topbar__center--open:hover {
  background: #2860e1;
  color: #ffffff;
}
.dt-topbar__tabs {
  display: flex;
  align-items: center;
  overflow-x: auto;
  min-width: 0;
  -webkit-app-region: no-drag;
}
.dt-topbar__spacer {
  flex: 1;
  height: 100%;
}
.dt-tab {
  display: flex;
  align-items: center;
  border: none;
  border-radius: 6px;
  background: transparent;
  padding: 5px 6px 5px 10px;
  margin-right: 4px;
  font-size: 13px;
  color: #6b7280;
  cursor: pointer;
  white-space: nowrap;
  font-family: inherit;
  flex: none;
}
.dt-tab:hover {
  background: #f2f3f5;
}
.dt-tab--active {
  background: #e8e9eb;
  color: #1f2328;
  font-weight: 500;
}
.dt-tab__title {
  margin-right: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 160px;
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
  background: #dcdde0;
  color: #1f2328;
}
.dt-topbar__controls {
  display: flex;
  height: 100%;
  flex: none;
  -webkit-app-region: no-drag;
}
.dt-winbtn {
  width: 44px;
  height: 100%;
  border: none;
  background: transparent;
  font-size: 12px;
  color: #4b5563;
  cursor: pointer;
}
.dt-winbtn:hover {
  background: #f2f3f5;
}
.dt-winbtn--close:hover {
  background: #ef4444;
  color: #ffffff;
}
</style>
