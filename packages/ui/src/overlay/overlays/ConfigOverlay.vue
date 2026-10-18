<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import SystemSettingsDialog from '../../settings/SystemSettingsDialog.vue'
import { useOverlayStore } from '../use-overlay-store'

/**
 * 设备配置浮层（config 窗渲染分支）：全屏遮罩模态，业务页（设备测试页）经桥发起。
 * 系统设置统一弹窗承载各配置域（Tab 切换），openConfig 的 kind 语义 = 打开并定位页签；
 * 遮罩不做动画（同拍摄浮层），卡片 pop 入场 + flex 双轴居中（拍摄浮层内容超高才用贴顶布局）。
 * kind 作 key：弹窗开着时另一入口按钮改变 kind → 原地换弹窗并定位到对应页签。
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
    class="fixed inset-0 z-[10] flex items-center justify-center"
  >
    <div class="absolute inset-0 bg-[rgba(15,23,42,0.55)]" />
    <div class="ov-config__card ov-anim-pop relative h-[620px] w-[880px] max-h-[94vh] max-w-[94vw] overflow-hidden rounded-[16px] bg-white shadow-[0_24px_64px_rgba(2,8,20,0.32)]">
      <SystemSettingsDialog :initial-tab="store.configKind" @close="store.dismissConfig" />
    </div>
  </div>
</template>
