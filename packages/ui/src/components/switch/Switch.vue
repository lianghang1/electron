<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@ui/lib/utils'
import { SwitchRoot, SwitchThumb } from 'reka-ui'

const props = defineProps<{ class?: HTMLAttributes['class'] }>()
const model = defineModel<boolean>({ default: false })
</script>

<template>
  <SwitchRoot
    v-model="model"
    :class="cn(
      'relative inline-flex h-5.5 w-10 shrink-0 items-center rounded-full transition-colors data-[state=checked]:bg-primary data-[state=unchecked]:bg-input',
      props.class,
    )"
  >
    <SwitchThumb class="block size-4.5 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-[22px] data-[state=unchecked]:translate-x-[2px]" />
  </SwitchRoot>
</template>
