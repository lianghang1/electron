<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import type { BadgeVariants } from './index'
import { cn } from '@ui/lib/utils'
import { badgeVariants } from './index'

const props = defineProps<{
  variant?: BadgeVariants['variant']
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <span :class="cn(badgeVariants({ variant: props.variant }), props.class)">
    <slot />
  </span>
</template>
