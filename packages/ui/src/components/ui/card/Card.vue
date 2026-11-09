<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@ui/lib/utils'

const props = defineProps<{ class?: HTMLAttributes['class'] }>()
</script>

<template>
  <div :class="cn('rounded-window border border-border bg-card shadow-card', props.class)">
    <slot />
  </div>
</template>
