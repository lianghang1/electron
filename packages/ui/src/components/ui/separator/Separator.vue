<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@ui/lib/utils'
import { Separator } from 'reka-ui'

const props = withDefaults(defineProps<{
  class?: HTMLAttributes['class']
  orientation?: 'horizontal' | 'vertical'
}>(), { orientation: 'horizontal' })
</script>

<template>
  <Separator
    :orientation="props.orientation"
    :class="cn(
      'shrink-0 bg-border',
      props.orientation === 'vertical' ? 'h-full w-px' : 'h-px w-full',
      props.class,
    )"
  />
</template>
