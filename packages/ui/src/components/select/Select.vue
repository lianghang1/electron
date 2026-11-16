<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import type { SelectOption } from './types'
import { cn } from '@ui/lib/utils'

const props = withDefaults(defineProps<{
  options: readonly SelectOption[]
  class?: HTMLAttributes['class']
  placeholder?: string
  disabled?: boolean
}>(), { placeholder: '请选择' })

const model = defineModel<string>({ default: '' })
</script>

<template>
  <select
    v-model="model"
    :disabled="props.disabled"
    :class="cn(
      'h-9 w-full appearance-none rounded-md border border-input bg-background px-3 pr-8 text-ui-base text-foreground outline-none transition-colors focus-visible:border-ring disabled:opacity-40',
      props.class,
    )"
  >
    <option v-if="!model" value="" disabled>
      {{ props.placeholder }}
    </option>
    <option
      v-for="option in props.options"
      :key="option.value"
      :value="option.value"
      :disabled="option.disabled"
    >
      {{ option.label }}
    </option>
  </select>
</template>
