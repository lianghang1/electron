<script setup lang="ts">
import SystemSettingsDialog from '../../settings/SystemSettingsDialog.vue'
import { useOverlayStore } from '../use-overlay-store'

/**
 * 设备配置浮层（config 窗渲染分支）：全屏遮罩模态，业务页（设备测试页）经桥发起。
 * 弹窗外壳（标题栏/尺寸/关闭语义）由 SystemSettingsDialog 内部的 UiDialog 承载，
 * 本组件只负责会话分发；kind 作 key：弹窗开着时另一入口改变 kind → 原地换内容并定位页签。
 * 样式全部 scoped 自包含：本包须可在任意宿主应用复用，不依赖宿主的 UnoCSS 管线。
 */
const store = useOverlayStore()
</script>

<template>
  <SystemSettingsDialog
    v-if="store.configKind && store.overlayVisible"
    :key="store.configKind"
    :initial-tab="store.configKind"
    @close="store.dismissConfig"
  />
</template>
