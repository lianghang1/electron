<script setup lang="ts">
/**
 * Input：文本输入（纯皮肤组件）。
 */
const model = defineModel<string>({ default: '' })
defineProps<{ placeholder?: string }>()
</script>

<template>
  <input
    v-model="model"
    type="text"
    :placeholder="placeholder"
    class="h-9 w-full px-3 text-[13px] outline-none transition-colors placeholder:opacity-60"
    style="background: var(--dt-page); color: var(--dt-text-1); border: 1px solid var(--dt-line); border-radius: var(--dt-radius)"
    @focus="($event.target as HTMLInputElement).style.borderColor = 'var(--dt-accent)'"
    @blur="($event.target as HTMLInputElement).style.borderColor = 'var(--dt-line)'"
  >
</template>
