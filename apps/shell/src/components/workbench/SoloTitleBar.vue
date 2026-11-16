<script setup lang="ts">
import { Minus, Square, X } from 'lucide-vue-next'

/** solo 窗口控制条（仅桌面形态）：拖拽区 + 当前应用名 + 三控制键，纯展示组件 */
defineProps<{
  title: string | null
}>()

defineEmits<{
  minimize: []
  maximize: []
  closeWindow: []
}>()
</script>

<template>
  <header class="flex h-chrome-solo items-center border-b border-border bg-glass">
    <span class="titlebar-drag h-full min-w-3 flex-1" />
    <!-- solo 直出态：名称跟平台单应用态同语义（窗口框里显示当前应用名） -->
    <span v-if="title" class="truncate text-ui-sm font-medium text-foreground">
      {{ title }}
    </span>
    <span class="titlebar-drag h-full min-w-3 flex-1" />
    <div class="flex h-full items-center">
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
  background: var(--hover);
}
.ctrl-close:hover {
  background: var(--destructive) !important;
  color: var(--destructive-foreground) !important;
}
</style>
