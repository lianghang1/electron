<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import SystemSettingsDialog from '../../settings/SystemSettingsDialog.vue'
import { useOverlayStore } from '../use-overlay-store'

/**
 * 设备配置浮层（config 窗渲染分支）：全屏遮罩模态，业务页（设备测试页）经桥发起。
 * 系统设置统一弹窗承载各配置域（Tab 切换），openConfig 的 kind 语义 = 打开并定位页签；
 * 遮罩不做动画（同拍摄浮层），卡片 pop 入场 + 双轴居中。
 * kind 作 key：弹窗开着时另一入口按钮改变 kind → 原地换弹窗并定位到对应页签。
 * 样式全部 scoped 自包含：本包须可在任意宿主应用复用，不依赖宿主的 UnoCSS 管线。
 */
const store = useOverlayStore()

/** 浮层窗键盘：ESC 关闭配置浮层 */
function onKeydown(e: KeyboardEvent): void {
  if (store.configKind && e.key === 'Escape') {
    e.preventDefault()
    store.dismissConfig()
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
    v-if="store.configKind && store.overlayVisible"
    :key="store.configKind"
    class="ov-config"
  >
    <div class="ov-config__mask" />
    <div class="ov-config__card ov-anim-pop">
      <SystemSettingsDialog :initial-tab="store.configKind" @close="store.dismissConfig" />
    </div>
  </div>
</template>

<style scoped>
.ov-config {
  position: fixed;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ov-config__mask {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
}

.ov-config__card {
  position: relative;
  height: 620px;
  width: 880px;
  max-height: 94vh;
  max-width: 94vw;
  overflow: hidden;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 24px 64px rgba(2, 8, 20, 0.32);
}
</style>
