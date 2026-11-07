<script setup lang="ts">
/**
 * 空状态页（兜底）：无任何应用 tab 时展示。
 * 壳是隐形容器——不露品牌、无装饰。信息要么可操作（应用行）、
 * 要么给运维（右下角版本行）、要么防"软件坏了"误会（无应用提示）。
 */
import { onMounted, ref } from 'vue'
import { desktop } from '@shell/bridge/client'

interface AppSummary {
  manifest: { id: string, name: string, icon?: string }
}

const emit = defineEmits<{ open: [appId: string] }>()

const version = ref('')
const apps = ref<AppSummary[]>([])

onMounted(async () => {
  version.value = (await desktop().shell.info()).version
  apps.value = await desktop().apps.list() as AppSummary[]
})
</script>

<template>
  <div class="relative flex h-full w-full flex-col items-center justify-center">
    <!-- 出口：应用行（有应用才出现） -->
    <div v-if="apps.length" class="flex items-start gap-7">
      <button
        v-for="app in apps"
        :key="app.manifest.id"
        class="entry flex flex-col items-center gap-2"
        @click="emit('open', app.manifest.id)"
      >
        <span class="entry-tile flex size-12 items-center justify-center rounded-[10px] text-base font-semibold text-white">
          {{ app.manifest.name.slice(0, 1) }}
        </span>
        <span class="text-xs" style="color: var(--dt-text-2)">{{ app.manifest.name }}</span>
      </button>
    </div>

    <!-- 无应用：一行功能性提示，防"软件坏了"误会 -->
    <p v-else class="text-[13px]" style="color: var(--dt-text-3)">点击顶栏「+」打开应用</p>

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
