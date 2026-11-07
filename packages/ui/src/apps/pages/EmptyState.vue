<script setup lang="ts">
/**
 * 空状态页（兜底）：无任何应用 tab 时展示。
 * 职责三件事：不尴尬 / 给出口（应用行）/ 品牌露面一次即收。
 * 纪律：无欢迎语、无渐变、无状态卡——信息要么可操作、要么给运维。
 */
import { onMounted, ref } from 'vue'
import { desktop } from '@shell/bridge/client'

interface AppSummary {
  manifest: { id: string, name: string, icon?: string }
}

const emit = defineEmits<{ open: [appId: string] }>()

const appName = ref('')
const version = ref('')
const apps = ref<AppSummary[]>([])

onMounted(async () => {
  const info = await desktop().shell.info()
  appName.value = info.name
  version.value = info.version
  apps.value = await desktop().apps.list() as AppSummary[]
})
</script>

<template>
  <div class="relative flex h-full w-full flex-col items-center justify-center gap-8">
    <!-- 品牌：标识 + 名，单色，一次即收 -->
    <div class="flex items-center gap-2.5">
      <span class="size-5 rounded-md" style="background: var(--dt-accent)" />
      <span class="text-sm font-semibold" style="color: var(--dt-text-1)">{{ appName }}</span>
    </div>

    <!-- 出口：应用行；无应用时只留一句功能文案 -->
    <div v-if="apps.length" class="flex items-start gap-7">
      <button
        v-for="app in apps"
        :key="app.manifest.id"
        class="entry flex flex-col items-center gap-2"
        @click="emit('open', app.manifest.id)"
      >
        <span class="entry-tile flex size-11 items-center justify-center rounded-[10px] text-base font-semibold text-white">
          {{ app.manifest.name.slice(0, 1) }}
        </span>
        <span class="text-xs" style="color: var(--dt-text-2)">{{ app.manifest.name }}</span>
      </button>
    </div>
    <p v-else class="text-[13px]" style="color: var(--dt-text-3)">从顶栏「+」添加应用开始</p>

    <!-- 运维行：一行小字，不是状态卡 -->
    <p class="absolute bottom-2.5 right-4 text-[11px]" style="color: var(--dt-text-3)">v{{ version }}</p>
  </div>
</template>

<style scoped>
.entry-tile {
  background: var(--dt-text-1);
  transition: transform 0.15s ease;
}
.entry:hover .entry-tile {
  transform: translateY(-2px);
}
</style>
