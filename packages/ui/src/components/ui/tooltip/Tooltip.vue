<script setup lang="ts">
import { TooltipRoot } from 'reka-ui'
import TooltipContent from './TooltipContent.vue'
import TooltipProvider from './TooltipProvider.vue'
import TooltipTrigger from './TooltipTrigger.vue'

withDefaults(defineProps<{
  text: string
  side?: 'top' | 'right' | 'bottom' | 'left'
}>(), { side: 'right' })
</script>

<template>
  <TooltipProvider>
    <TooltipRoot>
      <TooltipTrigger>
        <slot />
      </TooltipTrigger>
      <TooltipContent :side="side">
        {{ text }}
      </TooltipContent>
    </TooltipRoot>
  </TooltipProvider>
</template>
