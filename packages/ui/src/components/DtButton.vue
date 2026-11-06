<script setup lang="ts">
/**
 * Button：基础按钮（reka-ui 无需行为层，纯皮肤组件）。
 * variant: solid（强调）/ soft（次级）/ ghost（幽灵）· size: sm / md
 */
withDefaults(defineProps<{
  variant?: 'solid' | 'soft' | 'ghost'
  size?: 'sm' | 'md'
}>(), { variant: 'soft', size: 'md' })
</script>

<template>
  <button
    class="inline-flex items-center justify-center gap-1.5 font-medium transition-colors select-none disabled:opacity-40"
    :class="[
      size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-9 px-4 text-[13px]',
      variant === 'solid' ? 'text-white hover:opacity-90' : '',
    ]"
    :style="variant === 'solid'
      ? { background: 'var(--dt-accent)', borderRadius: 'var(--dt-radius)' }
      : variant === 'soft'
        ? { background: 'var(--dt-accent-soft)', color: 'var(--dt-accent)', borderRadius: 'var(--dt-radius)' }
        : { color: 'var(--dt-text-2)', borderRadius: 'var(--dt-radius)' }"
  >
    <slot />
  </button>
</template>
