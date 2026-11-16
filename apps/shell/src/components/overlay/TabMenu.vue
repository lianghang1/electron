<script setup lang="ts">
import type { MenuView } from '../../overlay/types'

/**
 * 页签菜单：dialog 表面 anchor 落位面板（全屏点击收场由 SurfaceOutlet
 * anchor 容器配对，payload.x/y 决定落点）。
 */
defineProps<{
  menu: MenuView
}>()

defineEmits<{
  select: [action: string]
  close: []
}>()
</script>

<template>
  <div class="w-44 rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg">
    <button
      class="flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      @click="$emit('select', 'activate')"
    >
      切换到此页
    </button>
    <button
      class="flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      @click="$emit('select', 'reload')"
    >
      重新加载
    </button>
    <button
      v-if="menu.closable"
      class="flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-sm text-destructive transition-colors hover:bg-accent"
      @click="$emit('select', 'close-tab')"
    >
      关闭标签
    </button>
  </div>
</template>
