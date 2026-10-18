<script setup lang="ts">
import CaptureOverlay from './overlays/CaptureOverlay.vue'
import ConfigOverlay from './overlays/ConfigOverlay.vue'
import MenuOverlay from './overlays/MenuOverlay.vue'
import MessagePanel from './overlays/MessagePanel.vue'
import PermissionOverlay from './overlays/PermissionOverlay.vue'
import { provideOverlayStore } from './use-overlay-store'

/**
 * 浮层页根组件（OverlayWindow 的 renderer，经 #/overlay 路由挂载）：
 * 原生层级压过 WebContentsView，承载必须盖住 Web 容器区域的浮层。
 * 同一份页面服务五类浮层窗（每窗只挂自己的渲染分支，互斥渲染）：
 * - 消息窗（panel）：下载通知卡 + 通知 toast（右上角）
 * - 弹窗窗（dialog）：运行时授权决策卡（全屏遮罩模态，居中）
 * - 菜单窗（menu）：Tab 右键菜单（全屏透明模态，锚点定位——页面内容保持可见）
 * - 拍摄窗（capture）：拍摄浮层（全屏遮罩模态）
 * - 配置窗（config）：设备配置弹窗（全屏遮罩模态）
 *
 * 数据流统一走 provideOverlayStore（全量订阅 + 单次 overlay.sync，Main 按窗口身份定点推送），
 * 交互语义交给 reka-ui 原语，外观用 UnoCSS 工具类自绘；卡片样式固定高对比配色（不随 Shell 主题）。
 * 任何 Electron 应用均可复用本组件作为浮层窗页面根。
 */
const store = provideOverlayStore()
</script>

<template>
  <PermissionOverlay v-if="store.kind === 'dialog'" />
  <MenuOverlay v-else-if="store.kind === 'menu'" />
  <CaptureOverlay v-else-if="store.kind === 'capture'" />
  <ConfigOverlay v-else-if="store.kind === 'config'" />
  <MessagePanel v-else />
</template>

<style>
/* 浮层窗口页面基座：透明背景 + 无边距（Shell 本体与浮层共用 index.html） */
html,
body {
  margin: 0;
  padding: 0;
  background: transparent;
  overflow: hidden;
}

/* ---- 动画（Uno 工具类不便表达的 keyframes，类名常挂，元素插入时播一次） ---- */
@keyframes ov-fade {
  from { opacity: 0; }
}
@keyframes ov-pop {
  from {
    opacity: 0;
    transform: scale(0.94);
  }
}
@keyframes ov-slide {
  from {
    opacity: 0;
    transform: translateX(16px);
  }
}
.ov-anim-fade { animation: ov-fade 0.32s ease-out; }
.ov-anim-pop { animation: ov-pop 0.24s ease-out; }
.ov-anim-slide { animation: ov-slide 0.2s ease; }
</style>
