<script setup lang="ts">
import type { ButtonVariants } from '@ui/components/button'
import type { PaginationListItemProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { buttonVariants } from '@ui/components/button'
import { cn } from '@ui/lib/utils'
import { reactiveOmit } from '@vueuse/core'
import { PaginationListItem } from 'reka-ui'

const props = withDefaults(defineProps<PaginationListItemProps & {
  size?: ButtonVariants['size']
  class?: HTMLAttributes['class']
  isActive?: boolean
}>(), {
  size: 'icon',
})

const delegatedProps = reactiveOmit(props, 'class', 'size', 'isActive')
</script>

<template>
  <PaginationListItem
    data-slot="pagination-item"
    v-bind="delegatedProps"
    :class="cn(
      buttonVariants({
        variant: isActive ? 'outline' : 'ghost',
        size,
      }),
      props.class)"
  >
    <slot />
  </PaginationListItem>
</template>
