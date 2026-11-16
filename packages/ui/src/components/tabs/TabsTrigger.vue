<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@ui/lib/utils'
import { TabsTrigger } from 'reka-ui'

const props = defineProps<{ value: string, class?: HTMLAttributes['class'], disabled?: boolean }>()
</script>

<template>
  <TabsTrigger
    :value="props.value"
    :disabled="props.disabled"
    :class="cn(
      'relative h-10 shrink-0 px-3 text-ui-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40',
      'data-[state=active]:text-primary data-[state=active]:after:absolute data-[state=active]:after:inset-x-2 data-[state=active]:after:bottom-0 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-primary',
      props.class,
    )"
  >
    <slot />
  </TabsTrigger>
</template>
