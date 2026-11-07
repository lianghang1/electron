<script setup lang="ts">
/**
 * 空状态页（desktop-platform 兜底，全关应用才出现）：
 * 锁屏气质——细字重大时钟 + 日期，零装饰。壳无品牌，仅右下角运维版本行。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { desktop } from '@shell/bridge/client'

const version = ref('')
const now = ref(new Date())
let timer: ReturnType<typeof setInterval> | undefined

const time = computed(() =>
  `${String(now.value.getHours()).padStart(2, '0')}:${String(now.value.getMinutes()).padStart(2, '0')}`,
)
const date = computed(() => {
  const d = now.value
  const weekday = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
  return `${d.getMonth() + 1}月${d.getDate()}日 星期${weekday}`
})

onMounted(async () => {
  version.value = (await desktop().shell.info()).version
  timer = setInterval(() => (now.value = new Date()), 1000)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <div
    class="relative flex h-full w-full flex-col items-center justify-center"
    style="background: linear-gradient(168deg, var(--dt-surface-hover) 0%, var(--dt-page) 100%)"
  >
    <div class="clock text-[64px] leading-none" style="color: var(--dt-text-1)">{{ time }}</div>
    <div class="mt-3 text-[13px]" style="color: var(--dt-text-2)">{{ date }}</div>
    <p class="absolute bottom-2.5 right-4 text-[11px]" style="color: var(--dt-text-3)">v{{ version }}</p>
  </div>
</template>

<style scoped>
.clock {
  font-weight: 200;
  letter-spacing: 2px;
  font-variant-numeric: tabular-nums;
}
</style>
