<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

const props = defineProps<{
  /** UVC 实时流（非空渲染 video 并播放） */
  stream?: MediaStream | null
  /** ws 预览帧（JPEG dataURL，stream 为空时展示） */
  frameSrc?: string
  rotate?: number
  mirror?: boolean
  /** 无画面时的空态文案（未检测到设备 / 正在检测等） */
  emptyText?: string
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
  <!-- 取景面：黑底衬画面（视频面惯例，非品牌样式） -->
  <div class="relative flex h-full w-full items-center justify-center overflow-hidden rounded-lg border border-border bg-black">
    <video v-if="stream" ref="videoEl" class="max-h-full max-w-full bg-white object-contain" playsinline muted :style="{ transform }" />
    <img v-else-if="frameSrc" class="max-h-full max-w-full bg-white object-contain" :src="frameSrc" alt="实时预览" :style="{ transform }">
    <span v-else class="text-xs text-muted-foreground select-none">
      {{ props.emptyText || '开启预览后拍摄' }}
    </span>
  </div>
</template>
