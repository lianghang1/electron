<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@ui/lib/utils'
import { TabsRoot } from 'reka-ui'

const props = defineProps<{ class?: HTMLAttributes['class'] }>()
const model = defineModel<string>({ default: '' })
</script>

<template>
  <TabsRoot v-model="model" :class="cn('flex h-full min-h-0 w-full', props.class)">
    <slot />
  </TabsRoot>
</template>
