<script setup lang="ts">
import type { CaptureResult } from '@shell/shared'
import { X } from '@lucide/vue'
import { Button } from '@ui/components'

defineProps<{
  /** 缩略条数据：index 为结果数组原始下标，供删除/放大定位 */
  items: { result: CaptureResult, index: number }[]
  /** 正在放大查看的结果下标（高亮标记），null = 未在查看 */
  activeIndex?: number | null
}>()

const emit = defineEmits<{ remove: [index: number], view: [index: number] }>()
</script>

<template>
  <div class="flex min-h-[86px] items-center gap-2.5 overflow-x-auto rounded-lg border border-dashed border-border p-1.5">
    <template v-if="items.length">
      <figure
        v-for="item in items"
        :key="item.index"
        class="relative m-0 flex-shrink-0 animate-in cursor-pointer fade-in duration-150 zoom-in-95"
        :title="item.result.imagePath"
        @click="emit('view', item.index)"
      >
        <img
          :src="item.result.thumbDataUrl"
          alt="拍摄记录"
          class="block h-[72px] rounded-md border border-border bg-black"
          :class="item.index === activeIndex ? 'ring-2 ring-primary ring-offset-2 ring-offset-popover' : ''"
        >
        <Button
          variant="destructive"
          size="icon-xs"
          class="absolute top-1 right-1 rounded-full"
          aria-label="删除"
          @click.stop="emit('remove', item.index)"
        >
          <X />
        </Button>
      </figure>
    </template>
    <span v-else class="w-full text-center text-xs text-muted-foreground">拍摄结果将显示在这里，完成后可删除重拍</span>
  </div>
</template>
