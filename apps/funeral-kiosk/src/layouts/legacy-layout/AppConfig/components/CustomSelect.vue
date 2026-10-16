<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: unknown
  options: Array<{ label: string, value: string | number, disabled?: boolean }>
  disabled?: boolean
  placeholder?: string
}>(), {
  placeholder: '请选择',
  disabled: false,
})

// 定义事件
const emit = defineEmits(['update:modelValue', 'change'])

// 组件状态
const isOpen = ref(false) // 下拉框是否打开
const hoverIndex = ref(-1) // 悬停的选项索引

// 计算属性：显示的值
const displayValue = computed(() => {
  if (!props.modelValue) {
    return props.placeholder
  }

  const selectedOption = props.options.find(option => option.value === props.modelValue)
  return selectedOption ? selectedOption.label : props.placeholder
})

// 切换下拉框
function toggleDropdown() {
  if (props.disabled) { return }
  isOpen.value = !isOpen.value
  hoverIndex.value = -1
}

// 选择选项
function selectOption(value: any) {
  if (props.disabled) { return }

  const option = props.options.find(opt => opt.value === value)
  if (option && !option.disabled) {
    emit('update:modelValue', value)
    emit('change', value)
    isOpen.value = false
  }
}

// 导航选项（键盘支持）
function navigateOptions(direction: any) {
  if (!isOpen.value) {
    isOpen.value = true
    return
  }

  const enabledOptions = props.options.filter(option => !option.disabled)
  if (enabledOptions.length === 0) { return }

  let newIndex = hoverIndex.value + direction
  if (newIndex < 0) {
    newIndex = enabledOptions.length - 1
  }
  else if (newIndex >= enabledOptions.length) {
    newIndex = 0
  }

  hoverIndex.value = newIndex
}

// 点击外部关闭下拉框
function handleClickOutside(event: any) {
  const selectElement = document.querySelector('.custom-select')
  if (selectElement && !selectElement.contains(event.target)) {
    isOpen.value = false
    hoverIndex.value = -1
  }
}

// 监听点击外部事件
onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

// 监听值变化
watch(
  () => props.modelValue,
  () => {
    hoverIndex.value = -1
  },
)
</script>

<template>
  <div class="custom-select" :class="{ 'is-disabled': disabled, 'is-open': isOpen }">
    <!-- 选择器头部 -->
    <div
      class="custom-select-header"
      :tabindex="disabled ? -1 : 0"
      :aria-expanded="isOpen"
      :aria-disabled="disabled"
      @click="toggleDropdown"
      @keydown.enter="toggleDropdown"
      @keydown.space="toggleDropdown"
      @keydown.arrow-down="navigateOptions(1)"
      @keydown.arrow-up="navigateOptions(-1)"
    >
      <!-- 选中值显示 -->
      <div class="custom-select-value">
        {{ displayValue }}
      </div>
      <!-- 下拉箭头 -->
      <div class="custom-select-arrow">
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          :class="{ 'is-rotated': isOpen }"
        >
          <path
            d="M2 4L6 8L10 4"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </div>
    </div>

    <!-- 下拉选项列表 -->
    <div
      v-if="isOpen"
      class="custom-select-dropdown"
      @click.stop
    >
      <div class="custom-select-options">
        <!-- 选项 -->
        <div
          v-for="(option, index) in options"
          :key="option.value"
          class="custom-select-option"
          :class="{
            'is-selected': option.value === modelValue,
            'is-hovered': hoverIndex === index,
            'is-disabled': option.disabled,
          }"
          :tabindex="0"
          @click="selectOption(option.value)"
          @mouseenter="hoverIndex = index"
          @mouseleave="hoverIndex = -1"
          @keydown.enter="selectOption(option.value)"
        >
          {{ option.label }}
        </div>

        <!-- 无选项时的提示 -->
        <div v-if="options.length === 0" class="custom-select-empty">
          无可用选项
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 自定义下拉框 - 参考现代互联网设计 */
.custom-select {
  position: relative;
  width: 100%;
  font-size: 14px;
}

/* 选择器头部 */
.custom-select-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  background: white;
  color: #333;
  cursor: pointer;
  transition: all 0.2s ease;
  height: 40px;
  box-sizing: border-box;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

/* 触摸友好的悬停效果 */
.custom-select-header:hover:not(.is-disabled) {
  border-color: var(--v-color-primary-hover, #40a9ff);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

/* 聚焦效果 */
.custom-select-header:focus {
  outline: none;
  border-color: var(--v-color-primary, #003594);
  box-shadow: 0 0 0 3px var(--v-color-primary-shadow, rgba(0, 53, 148, 0.1));
}

/* 选中值显示 */
.custom-select-value {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 20px;
  font-size: 15px;
}

/* 下拉箭头 */
.custom-select-arrow {
  margin-left: 8px;
  color: #999;
  transition: all 0.2s ease;
  pointer-events: none;
  display: flex;
  align-items: center;
  justify-content: center;
}

.custom-select.is-open .custom-select-arrow svg {
  transform: rotate(180deg);
  color: var(--v-color-primary, #003594);
}

.custom-select-arrow svg {
  width: 12px;
  height: 12px;
  transition: transform 0.2s ease, color 0.2s ease;
}

/* 下拉菜单 */
.custom-select-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 6px;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  z-index: 1000;
  animation: dropdownFadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  max-height: 240px;
  overflow-y: auto;
  backdrop-filter: blur(8px);
  background-clip: padding-box;
}

/* 下拉菜单动画 */
@keyframes dropdownFadeIn {
  from {
    opacity: 0;
    transform: translateY(-10px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* 选项列表 */
.custom-select-options {
  display: flex;
  flex-direction: column;
  border-radius: 8px;
  overflow: hidden;
}

/* 单个选项 */
.custom-select-option {
  padding: 8px 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-height: 32px;
  display: flex;
  align-items: center;
  position: relative;
  font-size: 14px;
  color: #333;
}

/* 选项触摸反馈 */
.custom-select-option:hover:not(.is-disabled) {
  background: #f3f4f6;
  color: var(--v-color-primary, #003594);
}

/* 选项选中效果 */
.custom-select-option.is-selected {
  background: linear-gradient(135deg, #e6f7ff 0%, #f0f9ff 100%);
  color: var(--v-color-primary, #003594);
  font-weight: 500;
  border-left: 3px solid var(--v-color-primary, #003594);
}

/* 选项选中触摸反馈 */
.custom-select-option.is-selected:hover:not(.is-disabled) {
  background: linear-gradient(135deg, #dbeafe 0%, #eff6ff 100%);
}

/* 选项禁用状态 */
.custom-select-option.is-disabled {
  background: #f9fafb;
  color: #d1d5db;
  cursor: not-allowed;
  opacity: 0.6;
}

/* 无选项提示 */
.custom-select-empty {
  padding: 24px;
  text-align: center;
  color: #9ca3af;
  font-size: 14px;
  background: #f9fafb;
  border-radius: 8px;
  margin: 8px;
}

/* 禁用状态 */
.custom-select.is-disabled {
  opacity: 0.6;
}

.custom-select.is-disabled .custom-select-header {
  background: #f9fafb;
  cursor: not-allowed;
  border-color: #e5e7eb;
  box-shadow: none;
  transform: none;
}

/* 增强触摸反馈 */
/* 头部触摸反馈 */
.custom-select-header:active:not(.is-disabled) {
  transform: scale(0.98);
  transition: transform 0.1s ease;
}

/* 选项触摸反馈 */
.custom-select-option:active:not(.is-disabled) {
  transform: scale(0.98);
  background: #e5e7eb;
  transition: transform 0.1s ease, background 0.1s ease;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .custom-select-header {
    padding: 10px 14px;
    height: 40px;
    border-radius: 6px;
  }

  .custom-select-option {
    padding: 12px 14px;
    min-height: 36px;
    font-size: 15px;
  }

  .custom-select-value {
    line-height: 20px;
    font-size: 15px;
  }

  .custom-select-dropdown {
    margin-top: 6px;
    border-radius: 6px;
    max-height: 240px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }
}

/* 触摸屏优化 */
@media (hover: none) and (pointer: coarse) {
  .custom-select-option {
    padding: 14px;
    min-height: 40px;
  }

  .custom-select-header {
    height: 40px;
  }

  .custom-select-option:hover:not(.is-disabled) {
    background: #f3f4f6;
  }

  .custom-select-option:active:not(.is-disabled) {
    background: #e5e7eb;
    transform: scale(0.98);
  }

  .custom-select-header:active:not(.is-disabled) {
    transform: scale(0.98);
  }
}

/* 滚动条样式 */
.custom-select-dropdown::-webkit-scrollbar {
  width: 6px;
}

.custom-select-dropdown::-webkit-scrollbar-track {
  background: #f0f0f0;
  border-radius: 3px;
}

.custom-select-dropdown::-webkit-scrollbar-thumb {
  background: #d0d0d0;
  border-radius: 3px;
}

/* Firefox 滚动条样式 */
.custom-select-dropdown {
  scrollbar-width: thin;
  scrollbar-color: #d0d0d0 #f0f0f0;
}
</style>
