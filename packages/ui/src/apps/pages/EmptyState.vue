<script setup lang="ts">
import { desktop } from '@shell/bridge/client'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

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
  <div class="relative flex h-full w-full flex-col items-center justify-center bg-linear-to-br from-secondary to-background">
    <div class="clock text-ui-display leading-none text-foreground">
      {{ time }}
    </div>
    <div class="mt-3 text-ui-base text-muted-foreground">
      {{ date }}
    </div>
    <p class="absolute bottom-2.5 right-4 text-ui-sm text-foreground-subtle">
      v{{ version }}
    </p>
  </div>
</template>

<style scoped>
.clock {
  font-weight: 200;
  letter-spacing: 2px;
  font-variant-numeric: tabular-nums;
}
</style>
