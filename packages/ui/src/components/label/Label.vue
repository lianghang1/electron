<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@ui/lib/utils'

const props = defineProps<{ class?: HTMLAttributes['class'] }>()
</script>

<template>
  <label :class="cn('text-ui-caption font-medium text-muted-foreground', props.class)">
    <slot />
  </label>
</template>
