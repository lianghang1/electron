<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@ui/lib/utils'
import { X } from 'lucide-vue-next'
import { DialogClose, DialogContent, DialogOverlay, DialogPortal } from 'reka-ui'

const props = defineProps<{
  class?: HTMLAttributes['class']
  width?: string
}>()
</script>

<template>
  <DialogPortal>
    <DialogOverlay class="fixed inset-0 z-50 bg-overlay backdrop-blur-[2px]" />
    <DialogContent
      :class="cn(
        'fixed left-1/2 top-1/2 z-50 max-h-[84vh] w-full max-w-[92vw] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-window border border-border bg-popover p-5 text-popover-foreground shadow-float outline-none',
        props.class,
      )"
      :style="{ width: props.width ?? '480px' }"
    >
      <slot />
      <DialogClose
        class="absolute right-4 top-4 flex size-7 items-center justify-center rounded-md text-foreground-subtle transition-colors hover:bg-hover hover:text-foreground"
        aria-label="关闭"
      >
        <X :size="14" />
      </DialogClose>
    </DialogContent>
  </DialogPortal>
</template>
