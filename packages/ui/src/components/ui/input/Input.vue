<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@ui/lib/utils'

const props = withDefaults(defineProps<{
  class?: HTMLAttributes['class']
  placeholder?: string
  type?: string
}>(), { type: 'text' })
const model = defineModel<string>({ default: '' })
</script>

<template>
  <input
    v-model="model"
    :type="props.type"
    :placeholder="props.placeholder"
    :class="cn(
      'h-9 w-full rounded-md border border-input bg-background px-3 text-ui-base text-foreground outline-none transition-colors placeholder:text-foreground-subtle focus-visible:border-ring',
      props.class,
    )"
  >
</template>
