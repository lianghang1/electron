<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@ui/lib/utils'

const props = defineProps<{ class?: HTMLAttributes['class'] }>()
</script>

<template>
  <div :class="cn('min-h-0 flex-1 overflow-auto p-4', props.class)">
    <slot />
  </div>
</template>
