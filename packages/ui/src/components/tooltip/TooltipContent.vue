<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@ui/lib/utils'
import { TooltipContent, TooltipPortal } from 'reka-ui'

const props = withDefaults(defineProps<{
  class?: HTMLAttributes['class']
  side?: 'top' | 'right' | 'bottom' | 'left'
  sideOffset?: number
}>(), { side: 'top', sideOffset: 8 })
</script>

<template>
  <TooltipPortal>
    <TooltipContent
      :side="props.side"
      :side-offset="props.sideOffset"
      :class="cn('z-50 whitespace-nowrap rounded-md border border-border bg-popover px-2.5 py-1.5 text-ui-sm text-popover-foreground shadow-card', props.class)"
    >
      <slot />
    </TooltipContent>
  </TooltipPortal>
</template>
