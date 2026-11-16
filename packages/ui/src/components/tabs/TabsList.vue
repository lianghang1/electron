<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@ui/lib/utils'
import { TabsList } from 'reka-ui'

const props = defineProps<{ class?: HTMLAttributes['class'] }>()
</script>

<template>
  <TabsList :class="cn('flex shrink-0 items-center gap-1 border-b border-border px-3', props.class)">
    <slot />
  </TabsList>
</template>
