<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@ui/lib/utils'
import { TabsContent } from 'reka-ui'

const props = defineProps<{ value: string, class?: HTMLAttributes['class'] }>()
</script>

<template>
  <TabsContent :value="props.value" :class="cn('min-h-0 flex-1 overflow-auto outline-none', props.class)">
    <slot />
  </TabsContent>
</template>
