<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@ui/lib/utils'
import { DialogDescription } from 'reka-ui'

const props = defineProps<{ class?: HTMLAttributes['class'] }>()
</script>

<template>
  <DialogDescription :class="cn('text-ui-sm text-muted-foreground', props.class)">
    <slot />
  </DialogDescription>
</template>
