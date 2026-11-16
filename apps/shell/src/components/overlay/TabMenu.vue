<script setup lang="ts">
import type { MenuView } from '../../composables/use-overlay-state'

/** 页签菜单：锚点由发起方给出，遮罩外点关闭 */
defineProps<{
  menu: MenuView
}>()

defineEmits<{
  select: [action: string]
  close: []
}>()
</script>

<template>
  <div class="absolute inset-0 z-20" @click.self="$emit('close')">
    <div
      class="absolute w-44 rounded-xl bg-popover p-1 shadow-lg"
      :style="{ left: `${menu.x}px`, top: `${menu.y}px` }"
    >
      <button class="w-full rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-accent" @click="$emit('select', 'activate')">
        切换到此页
      </button>
      <button class="w-full rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-accent" @click="$emit('select', 'reload')">
        重新加载
      </button>
      <button v-if="menu.closable" class="w-full rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-accent" @click="$emit('select', 'close-tab')">
        关闭标签
      </button>
    </div>
  </div>
</template>
