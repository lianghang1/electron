<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import CaptureDialog from '../../capture/CaptureDialog.vue'
import { useOverlayStore } from '../use-overlay-store'

/**
 * 拍摄浮层（capture 窗渲染分支）：全屏遮罩模态，预览/拍摄在浮层窗内闭环，
 * 确认后结果由 Main 推回发起 tab；sessionId 作 key，新会话重建组件（会话状态归零）。
 * 遮罩不做动画：大面积半透明淡入与窗口首帧绘制同帧争抢会跳帧，卡片保留 pop 入场。
 * 卡片 flex 贴顶居中：ov-pop 动画的 transform 会覆盖 translateX(-50%)，
 * 混用会先从偏移位弹出再跳回居中（观感「从右侧飘入」）。
 * 样式全部 scoped 自包含：本包须可在任意宿主应用复用，不依赖宿主的 UnoCSS 管线。
 */
const store = useOverlayStore()

/** 浮层窗键盘：ESC 关闭拍摄浮层 */
function onKeydown(e: KeyboardEvent): void {
  if (store.captureSession && e.key === 'Escape') {
    e.preventDefault()
    store.dismissCapture()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div
    v-if="store.captureSession && store.overlayVisible"
    :key="store.captureSession.sessionId"
    class="ov-capture"
  >
    <div class="ov-capture__mask" />
    <div class="ov-capture__card ov-anim-pop">
      <CaptureDialog :session="store.captureSession" @close="store.dismissCapture" />
    </div>
  </div>
</template>

<style scoped>
.ov-capture {
  position: fixed;
  inset: 0;
  z-index: 10;
  display: flex;
  justify-content: center;
}

.ov-capture__mask {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
}

.ov-capture__card {
  position: relative;
  align-self: flex-start;
  margin-top: 4vh;
  box-sizing: border-box;
  width: 820px;
  max-width: 94vw;
  padding: 20px;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 24px 64px rgba(2, 8, 20, 0.32);
}
</style>
