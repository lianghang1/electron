<script setup lang="ts">
/**
 * Dialog：模态对话框（reka-ui 行为层：焦点陷阱 / Esc / 遮罩点击 / 无障碍）。
 * 受控用法：v-model:open；皮肤：玻璃圆角卡片。
 */
import {
  DialogClose,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  useForwardPropsEmits,
} from 'reka-ui'

const props = defineProps<{
  open: boolean
  title: string
  width?: string
}>()

const emit = defineEmits<{ 'update:open': [value: boolean] }>()
const forwarded = useForwardPropsEmits(() => props, emit)
</script>

<template>
  <DialogRoot :open="props.open" @update:open="v => emit('update:open', v)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50" style="background: rgba(15, 23, 42, 0.32); backdrop-filter: blur(2px)" />
      <DialogContent
        class="fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2 p-5 shadow-2xl outline-none"
        :style="{ width: props.width ?? '480px', maxWidth: '92vw', maxHeight: '84vh', overflow: 'auto', background: 'var(--dt-surface)', border: '1px solid var(--dt-line)', borderRadius: '14px' }"
      >
        <div class="mb-4 flex items-center justify-between">
          <DialogTitle class="text-[15px] font-semibold" style="color: var(--dt-text-1)">
            {{ props.title }}
          </DialogTitle>
          <DialogClose
            class="flex size-7 items-center justify-center rounded-md hover:bg-[var(--dt-hover)]"
            style="color: var(--dt-text-3)"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </svg>
          </DialogClose>
        </div>
        <slot />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
