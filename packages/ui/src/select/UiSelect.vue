<script setup lang="ts">
import {
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectPortal,
  SelectRoot,
  SelectTrigger,
} from 'reka-ui'
import { computed } from 'vue'
/**
 * 下拉选择（reka-ui Select 封装）：键盘/无障碍交互由原语承担，样式定稿为弹窗表单形态。
 * 触发器撑满父容器宽度；选项渲染在 Portal 中避免被弹窗裁切。
 * 注意 reka 不允许空字符串选项值，需要「无选择」语义时由调用方传入哨兵值（如 'default'）。
 */
export interface UiSelectOption {
  value: string
  label: string
}

/** 分组选项：带标题的选项簇（如设备下拉的高拍仪 / 本机摄像头两组），与 options 二选一 */
export interface UiSelectGroup {
  label: string
  items: UiSelectOption[]
}

const props = defineProps<{
  modelValue: string
  options: UiSelectOption[]
  groups?: UiSelectGroup[]
  placeholder?: string
  disabled?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

/** 触发器回显候选项：分组项与平铺项合并检索（两者是二选一入参，回显必须两边都找） */
const allOptions = computed(() => [
  ...(props.groups ?? []).flatMap(group => group.items),
  ...props.options,
])
</script>

<template>
  <SelectRoot
    :model-value="props.modelValue"
    :disabled="props.disabled"
    @update:model-value="value => emit('update:modelValue', value ?? '')"
  >
    <SelectTrigger class="usel__trigger" :class="{ 'usel__trigger--empty': !props.modelValue }">
      <span class="usel__text">{{ allOptions.find(o => o.value === props.modelValue)?.label ?? props.placeholder ?? '' }}</span>
      <svg class="usel__arrow" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="m4 6 4 4 4-4" />
      </svg>
    </SelectTrigger>
    <SelectPortal>
      <SelectContent class="usel__content" position="popper" :side-offset="4">
        <template v-if="props.groups?.length">
          <SelectGroup v-for="group in props.groups" :key="group.label" class="usel__group">
            <div class="usel__group-label">
              {{ group.label }}
            </div>
            <SelectItem
              v-for="option in group.items"
              :key="option.value"
              :value="option.value"
              class="usel__item"
            >
              {{ option.label }}
            </SelectItem>
          </SelectGroup>
        </template>
        <SelectItem
          v-for="option in props.options"
          v-else
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
</style>

<style>
/*
 * 选项面板样式必须走全局块：SelectPortal 传送会打断 scoped data-v 属性继承，
 * 面板元素上没有 data-v 属性，scoped 选择器永远匹配不上（实测 z-index 与外观全部失效）。
 * 类名 usel__ 前缀已命名空间化，全局块无污染风险。
 */
.usel__content {
  /* Portal 挂到 body 根层：必须显式压过浮层弹窗卡（z-index:10），否则面板被弹窗遮住不可见 */
  z-index: 1000;
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

/* ---- 分组形态：组标题 + 组间距 ---- */
.usel__group + .usel__group {
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px solid #f0f2f5;
}

.usel__group-label {
  padding: 4px 10px 2px;
  font-size: 10.5px;
  color: #a5adb8;
  user-select: none;
}
</style>
