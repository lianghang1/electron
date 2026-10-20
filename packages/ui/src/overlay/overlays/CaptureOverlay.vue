<script setup lang="ts">
import CaptureDialog from '../../capture/CaptureDialog.vue'
import UiDialog from '../../dialog/UiDialog.vue'
import { useOverlayStore } from '../use-overlay-store'

/**
 * 拍摄浮层（capture 窗渲染分支）：全屏遮罩模态，预览/拍摄在浮层窗内闭环，
 * 确认后结果由 Main 推回发起 tab；sessionId 作 key，新会话重建组件（会话状态归零）。
 * 遮罩点击不关闭（防误触丢拍摄），ESC 交 UiDialog。
 */
const store = useOverlayStore()
</script>

<template>
  <UiDialog
    v-if="store.captureSession && store.overlayVisible"
    :key="store.captureSession.sessionId"
    :width="920"
    :padding="20"
    :mask-closable="false"
    :closable="false"
    @close="store.dismissCapture"
  >
    <CaptureDialog :session="store.captureSession" @close="store.dismissCapture" />
  </UiDialog>
</template>
