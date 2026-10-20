<script setup lang="ts">
defineProps<{
  /** 窗口最大化状态：切换最大化/还原图标 */
  maximized?: boolean
}>()

defineEmits<{
  minimize: []
  toggleMaximize: []
  closeWindow: []
}>()
</script>

<template>
  <!-- 自绘窗口控制：titleBarStyle: hidden 后系统标题栏不存在，本组件是最小化/最大化/关闭的唯一入口 -->
  <div class="dt-wincontrols">
    <button class="dt-winbtn" title="最小化" @click="$emit('minimize')">
      <svg viewBox="0 0 10 10" width="12" height="12"><path d="M1 5h8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" /></svg>
    </button>
    <button class="dt-winbtn" :title="maximized ? '还原' : '最大化'" @click="$emit('toggleMaximize')">
      <svg v-if="!maximized" viewBox="0 0 10 10" width="12" height="12"><rect x="1.5" y="1.5" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.2" /></svg>
      <svg v-else viewBox="0 0 10 10" width="12" height="12"><rect x="1.5" y="3" width="5.5" height="5.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.2" /><path d="M3.5 1.5h5v5" fill="none" stroke="currentColor" stroke-width="1.2" /></svg>
    </button>
    <button class="dt-winbtn dt-winbtn--close" title="关闭" @click="$emit('closeWindow')">
      <svg viewBox="0 0 10 10" width="12" height="12"><path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" /></svg>
    </button>
  </div>
</template>

<style scoped>
/* 全高条状窗口控制：宽度 46px、撑满标题栏高度，无圆角（IDE 平面风） */
.dt-wincontrols {
  display: flex;
  align-self: stretch;
  flex: none;
  -webkit-app-region: no-drag;
}
.dt-winbtn {
  width: 46px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--dt-text-2);
  cursor: pointer;
  transition: background var(--dt-dur) var(--dt-ease), color var(--dt-dur) var(--dt-ease);
}
.dt-winbtn:hover {
  background: var(--dt-surface-hover);
  color: var(--dt-text);
}
.dt-winbtn--close:hover {
  background: var(--dt-danger);
  color: #ffffff;
}
</style>
