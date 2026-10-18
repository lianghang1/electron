<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import CaptureDialog from '../../capture/CaptureDialog.vue'
import { useOverlayStore } from '../use-overlay-store'

/**
 * 拍摄浮层（capture 窗渲染分支）：全屏遮罩模态，预览/拍摄在浮层窗内闭环，
 * 确认后结果由 Main 推回发起 tab；sessionId 作 key，新会话重建组件（会话状态归零）。
 * 遮罩不做动画：大面积半透明淡入与窗口首帧绘制同帧争抢会跳帧，卡片保留 pop 入场。
 * 卡片用 flex 居中定位：ov-pop 动画的 transform 会覆盖 translateX(-50%)，
 * 混用会先从偏移位弹出再跳回居中（观感「从右侧飘入」）。
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
    class="fixed inset-0 z-[10] flex justify-center"
  >
    <div class="absolute inset-0 bg-[rgba(15,23,42,0.55)]" />
    <div class="ov-capture__card ov-anim-pop relative mt-[4vh] w-[820px] max-w-[94vw] self-start rounded-[16px] bg-white p-[20px] shadow-[0_24px_64px_rgba(2,8,20,0.32)]">
      <CaptureDialog :session="store.captureSession" @close="store.dismissCapture" />
    </div>
  </div>
</template>
