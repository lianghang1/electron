<script setup lang="ts">
import {
  SelectContent,
  SelectItem,
  SelectPortal,
  SelectRoot,
  SelectTrigger,
} from 'reka-ui'
/**
 * 下拉选择（reka-ui Select 封装）：键盘/无障碍交互由原语承担，样式定稿为弹窗表单形态。
 * 触发器撑满父容器宽度；选项渲染在 Portal 中避免被弹窗裁切。
 * 注意 reka 不允许空字符串选项值，需要「无选择」语义时由调用方传入哨兵值（如 'default'）。
 */
export interface UiSelectOption {
  value: string
  label: string
}

const props = defineProps<{
  modelValue: string
  options: UiSelectOption[]
  placeholder?: string
  disabled?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <SelectRoot
    :model-value="props.modelValue"
    :disabled="props.disabled"
    @update:model-value="value => emit('update:modelValue', value ?? '')"
  >
    <SelectTrigger class="usel__trigger" :class="{ 'usel__trigger--empty': !props.modelValue }">
      <span class="usel__text">{{ props.options.find(o => o.value === props.modelValue)?.label ?? props.placeholder ?? '' }}</span>
      <svg class="usel__arrow" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="m4 6 4 4 4-4" />
      </svg>
    </SelectTrigger>
    <SelectPortal>
      <SelectContent class="usel__content" position="popper" :side-offset="4" :z-index="50">
        <SelectItem
          v-for="option in props.options"
          :key="option.value"
          :value="option.value"
          class="usel__item"
        >
          {{ option.label }}
        </SelectItem>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>

<style scoped>
.usel__trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  height: 30px;
  padding: 0 10px;
  border: 1px solid #d5dae1;
  border-radius: 8px;
  background: #fff;
  font-family: inherit;
  font-size: 12px;
  color: #1f2328;
  cursor: pointer;
  transition: border-color 0.12s;
}

.usel__trigger:hover,
.usel__trigger[data-state='open'] {
  border-color: #0f766e;
}

.usel__trigger:focus-visible {
  border-color: #0f766e;
  outline: none;
}

.usel__trigger--empty .usel__text {
  color: #8a919c;
}

.usel__text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}

.usel__arrow {
  flex-shrink: 0;
  color: #8a919c;
}

.usel__content {
  min-width: var(--reka-select-trigger-width);
  max-height: 240px;
  padding: 4px;
  border: 1px solid #e6eaf0;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(2, 8, 20, 0.14);
  overflow-y: auto;
}

.usel__item {
  display: flex;
  align-items: center;
  height: 28px;
  padding: 0 10px;
  border-radius: 6px;
  font-size: 12px;
  color: #1f2328;
  cursor: pointer;
  user-select: none;
  outline: none;
}

.usel__item[data-highlighted] {
  background: #f3f6f9;
}

.usel__item[data-state='checked'] {
  color: #0f766e;
  font-weight: 600;
}
</style>
