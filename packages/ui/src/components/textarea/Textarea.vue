<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@ui/lib/utils'

const props = withDefaults(defineProps<{
  class?: HTMLAttributes['class']
  placeholder?: string
  rows?: number
  spellcheck?: boolean
  readonly?: boolean
}>(), { rows: 4, spellcheck: false })

const model = defineModel<string>({ default: '' })
</script>

<template>
  <textarea
    v-model="model"
    :rows="props.rows"
    :placeholder="props.placeholder"
    :spellcheck="props.spellcheck"
    :readonly="props.readonly"
    :class="cn(
      'w-full resize-y rounded-md border border-input bg-background px-3 py-2 font-mono text-ui-caption text-foreground outline-none transition-colors placeholder:text-foreground-subtle focus-visible:border-ring',
      props.class,
    )"
  />
</template>
