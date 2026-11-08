<script setup lang="ts">
import { DialogRoot, useForwardPropsEmits } from 'reka-ui'

const props = defineProps<{ open?: boolean, modal?: boolean }>()
const emits = defineEmits<{ 'update:open': [value: boolean] }>()
const forwarded = useForwardPropsEmits(props, emits)
</script>

<template>
  <DialogRoot v-bind="forwarded">
    <slot />
  </DialogRoot>
</template>
