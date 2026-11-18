<script setup lang="ts">
import { Minus, RefreshCw, Settings, Square, X } from '@ui/lib/lucide'

/** solo 窗口控制条（仅桌面形态）：徽标 + 应用名贴左缘，中部纯拖拽，右侧刷新/设置/三控制键 */
defineProps<{
  title: string | null
  icon?: string | null
  iconColor?: string | null
}>()

defineEmits<{
  reload: []
  openSettings: []
  minimize: []
  maximize: []
  closeWindow: []
}>()
</script>

<template>
  <header class="flex h-chrome-solo items-center gap-2 border-b border-border bg-background/85 pl-3">
    <!-- 徽标与应用名贴左缘：徽标与页签条 tab-mark 同构（图标优先，缺省首字 + 哈希色底） -->
    <span
      v-if="title"
      class="mark grid size-4 shrink-0 place-items-center overflow-hidden rounded-sm"
      :style="{ background: iconColor ?? 'var(--muted-foreground)' }"
      aria-hidden="true"
    >
      <img v-if="icon" :src="icon" alt="" class="size-4 object-cover">
      <span v-else class="text-xs leading-none font-semibold text-white">{{ title.slice(0, 1) }}</span>
    </span>
    <span v-if="title" class="truncate text-sm font-medium text-foreground">
      {{ title }}
    </span>
    <span class="titlebar-drag h-full min-w-3 flex-1" />
    <div class="flex h-full items-center">
      <button class="ctrl flex h-full w-11 items-center justify-center text-foreground" aria-label="刷新当前应用" title="刷新当前应用" @click="$emit('reload')">
        <RefreshCw :size="14" />
      </button>
      <button class="ctrl flex h-full w-11 items-center justify-center text-foreground" aria-label="设置" title="设置" @click="$emit('openSettings')">
        <Settings :size="14" />
      </button>
      <button class="ctrl flex h-full w-11 items-center justify-center text-foreground" aria-label="最小化" @click="$emit('minimize')">
        <Minus :size="13" />
      </button>
      <button class="ctrl flex h-full w-11 items-center justify-center text-foreground" aria-label="最大化" @click="$emit('maximize')">
        <Square :size="11" />
      </button>
      <button class="ctrl ctrl-close flex h-full w-11 items-center justify-center text-foreground" aria-label="关闭" @click="$emit('closeWindow')">
        <X :size="13" />
      </button>
    </div>
  </header>
</template>

<style scoped>
/* 自绘标题栏拖拽：整条标题栏都是拖拽区，可点组件必须显式豁免 */
.titlebar-drag {
  -webkit-app-region: drag;
}
.titlebar-drag button {
  -webkit-app-region: no-drag;
}

.ctrl {
  transition: background 0.12s ease;
}
.ctrl:hover {
  background: var(--accent);
}
.ctrl-close:hover {
  background: var(--destructive) !important;
  color: #fff !important;
}
</style>
