<script setup lang="ts">
import { TooltipProvider } from 'reka-ui'

withDefaults(defineProps<{ delayDuration?: number }>(), { delayDuration: 300 })
</script>

<template>
  <TooltipProvider :delay-duration="delayDuration">
    <slot />
  </TooltipProvider>
</template>
