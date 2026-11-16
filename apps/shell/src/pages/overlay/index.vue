<script setup lang="ts">
import { useOverlayEngine } from '../../overlay/engine'
import SurfaceOutlet from '../../overlay/SurfaceOutlet.vue'

// 全部浮层表面由 registry 清单 + engine 状态流驱动；本页只剩基建装配
const { surfaces, hoverCapture, dismiss, action } = useOverlayEngine()
</script>

<template>
  <div class="relative h-full w-full">
    <SurfaceOutlet
      :surfaces="surfaces"
      :hover-capture="hoverCapture"
      :dismiss="dismiss"
      :action="action"
    />
  </div>
</template>

<style>
/* 浮层页面基座：透明背景 + 无边距（Shell 本体与浮层共用 index.html）。
   透明载体依赖页面自身透明——全局 tokens 的 body 底色会把透明面
   填成不透明色块，整块盖住下层内容（master OverlayApp.vue 同款基座） */
html,
body {
  margin: 0;
  padding: 0;
  background: transparent;
  overflow: hidden;
}

/* plane 内交互表面进出场：纯 CSS 过渡，显隐零握手 */
.plane-fade-enter-active,
.plane-fade-leave-active {
  transition: opacity 0.16s ease;
}
.plane-fade-enter-from,
.plane-fade-leave-to {
  opacity: 0;
}

/* plane 全屏且不可拖动：组件内的 drag 把手热区一律失效（!important 压过
   app-region: drag），避免热区误吞 header 点击 */
* {
  -webkit-app-region: no-drag !important;
}
</style>
