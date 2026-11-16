<script setup lang="ts">
import type { ButtonVariants } from '@ui/components/button'
import type { HTMLAttributes } from 'vue'
import type { InputGroupButtonVariants } from '.'
import { Button } from '@ui/components/button'
import { cn } from '@ui/lib/utils'
import { inputGroupButtonVariants } from '.'

interface InputGroupButtonProps {
  variant?: ButtonVariants['variant']
  size?: InputGroupButtonVariants['size']
  class?: HTMLAttributes['class']
}

const props = withDefaults(defineProps<InputGroupButtonProps>(), {
  size: 'xs',
  variant: 'ghost',
})
</script>

<template>
  <Button
    :data-size="props.size"
    :variant="props.variant"
    :class="cn(inputGroupButtonVariants({ size: props.size }), props.class)"
  >
    <slot />
  </Button>
</template>
