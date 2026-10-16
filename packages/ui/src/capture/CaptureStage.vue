<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

const props = defineProps<{
  /** UVC 实时流（非空渲染 video 并播放） */
  stream?: MediaStream | null
  /** ws 预览帧（JPEG dataURL，stream 为空时展示） */
  frameSrc?: string
  rotate?: number
  mirror?: boolean
}>()

const videoEl = ref<HTMLVideoElement | null>(null)

const transform = computed(() => `rotate(${props.rotate ?? 0}deg) ${props.mirror ? 'scaleX(-1)' : ''}`)

watch(() => props.stream, async (s) => {
  // 等 video 随 v-if 挂载完成再绑流
  await nextTick()
  const video = videoEl.value
  if (!video) { return }
  if (s) {
    video.srcObject = s
    // 播放被自动播放策略拒绝仅影响预览画面（静音流基本不发生），不中断流程
    await video.play().catch(() => {})
  }
  else {
    video.srcObject = null
  }
}, { immediate: true })

defineExpose({ videoEl })
</script>

<template>
  <div class="cu-stage">
    <video v-if="stream" ref="videoEl" class="cu-stage__media" playsinline muted :style="{ transform }" />
    <img v-else-if="frameSrc" class="cu-stage__media" :src="frameSrc" alt="实时预览" :style="{ transform }">
    <span v-else class="cu-stage__empty">开启预览后拍摄</span>
  </div>
</template>

<style scoped>
.cu-stage {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  border: 1px solid #2a3040;
  border-radius: 10px;
  background: #10141c;
  overflow: hidden;
}

.cu-stage__media {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  background: #fff;
}

.cu-stage__empty {
  color: #6b7688;
  font-size: 12px;
  user-select: none;
}
</style>
