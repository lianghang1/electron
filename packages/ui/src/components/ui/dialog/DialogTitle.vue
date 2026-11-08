<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@ui/lib/utils'
import { DialogTitle } from 'reka-ui'

const props = defineProps<{ class?: HTMLAttributes['class'] }>()
</script>

<template>
  <DialogTitle :class="cn('text-ui-lg font-semibold text-foreground', props.class)">
    <slot />
  </DialogTitle>
</template>
