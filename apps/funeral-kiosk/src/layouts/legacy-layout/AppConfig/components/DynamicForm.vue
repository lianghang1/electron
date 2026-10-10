<script setup lang="ts">
import type { PropType } from 'vue'
import type { FieldConfig, FormConfig } from './types'

import { ref, watch } from 'vue'
import CustomSelect from './CustomSelect.vue'

// 表单数据类型
type FormData = Record<string, any>

// 组件属性
const props = defineProps({
  formConfig: {
    type: Object as PropType<FormConfig>,
    required: true,
  },
  modelValue: {
    type: Object as PropType<FormData>,
    required: true,
  },
})

// 组件事件
const emit = defineEmits<{
  'update:modelValue': [value: FormData]
  'change': [payload: { fieldId: string, value: any, formData: FormData }]
  'blur': [value: FormData]
}>()

// 表单数据 - 本地副本
const formData = ref<FormData>({ ...props.modelValue })

// 同步外部数据变化
watch(() => props.modelValue, (newValue) => {
  formData.value = { ...newValue }
}, { deep: true, immediate: true })

// 处理输入变化
function handleInput(fieldId: string, value: any): void {
  formData.value[fieldId] = value
  emit('update:modelValue', { ...formData.value })
  emit('change', {
    fieldId,
    value,
    formData: { ...formData.value },
  })
}

// 处理失去焦点
function handleBlur(): void {
  emit('blur', { ...formData.value })
}

// 处理开关/复选框切换
function handleToggle(fieldId: string): void {
  const newValue = !formData.value[fieldId]
  formData.value[fieldId] = newValue
  emit('update:modelValue', { ...formData.value })
  emit('change', {
    fieldId,
    value: newValue,
    formData: { ...formData.value },
  })
  handleBlur()
}

// 计算属性：评估条件
function evaluateCondition(condition?: FieldConfig['condition']): boolean {
  if (!condition) {
    return true
  }

  try {
    const { field, operator, value } = condition
    if (!field || !operator) {
      return true
    }

    const fieldValue = formData.value[field]

    switch (operator) {
      // eslint-disable-next-line eqeqeq
      case '==': return fieldValue == value
      case '===': return fieldValue === value
      // eslint-disable-next-line eqeqeq
      case '!=': return fieldValue != value
      case '!==': return fieldValue !== value
      case '>': return fieldValue > value
      case '<': return fieldValue < value
      case '>=': return fieldValue >= value
      case '<=': return fieldValue <= value
      default: return true
    }
  }
  catch (error) {
    console.error('条件评估错误:', error)
    return true
  }
}
</script>

<template>
  <div class="dynamic-form">
    <template v-for="field in formConfig.fields" :key="field?.field">
      <div
        v-if="field && (!field.condition || evaluateCondition(field.condition))"
        class="form-group"
      >
        <label
          v-if="field.label && field.type !== 'checkbox' && field.type !== 'switch'"
          class="field-label"
        >
          {{ field.label }}
        </label>

        <!-- 文本输入 -->
        <input
          v-if="field.type === 'text'"
          type="text"
          :value="formData[field.field]"
          :placeholder="field.placeholder || ''"
          :disabled="field.disabled || false"
          class="form-input"
          @input="handleInput(field.field, ($event.target as HTMLInputElement).value)"
          @blur="handleBlur"
        >

        <!-- 数字输入 -->
        <input
          v-else-if="field.type === 'number'"
          type="number"
          :value="formData[field.field]"
          :placeholder="field.placeholder || ''"
          :min="field.min"
          :max="field.max"
          :step="field.step"
          :disabled="field.disabled || false"
          class="form-input"
          @input="handleInput(field.field, parseFloat(($event.target as HTMLInputElement).value) || 0)"
          @blur="handleBlur"
        >

        <!-- 密码输入 -->
        <input
          v-else-if="field.type === 'password'"
          type="password"
          :value="formData[field.field]"
          :placeholder="field.placeholder || ''"
          :disabled="field.disabled || false"
          class="form-input"
          @input="handleInput(field.field, ($event.target as HTMLInputElement).value)"
          @blur="handleBlur"
        >

        <!-- 下拉选择 -->
        <div v-else-if="field.type === 'select'" class="form-group">
          <CustomSelect
            v-model="formData[field.field]"
            :options="field.options || []"
            :disabled="field.disabled || false"
            :placeholder="field.placeholder || '请选择'"
            @change="handleInput(field.field, $event); handleBlur()"
          />
        </div>

        <!-- 滑块输入 -->
        <div v-else-if="field.type === 'range'" class="range-wrapper">
          <div class="range-row">
            <input
              type="range"
              :value="formData[field.field]"
              :min="field.min || 0"
              :max="field.max || 100"
              :step="field.step || 1"
              :disabled="field.disabled || false"
              class="form-range"
              @input="handleInput(field.field, parseFloat(($event.target as HTMLInputElement).value))"
            >
            <span class="range-value">
              {{ formData[field.field] }}{{ field.suffix || '' }}
            </span>
          </div>
        </div>

        <!-- 复选框 -->
        <div
          v-else-if="field.type === 'checkbox'"
          class="checkbox-wrapper"
          @click="handleToggle(field.field)"
        >
          <div class="checkbox-box" :class="{ checked: formData[field.field] }">
            <svg
              v-if="formData[field.field]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="3"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <span class="checkbox-label">{{ field.label }}</span>
        </div>

        <!-- 开关 -->
        <div
          v-else-if="field.type === 'switch'"
          class="switch-wrapper"
          @click="handleToggle(field.field)"
        >
          <span class="switch-label">{{ field.label }}</span>
          <div class="switch-box" :class="{ checked: formData[field.field] }">
            <div class="switch-thumb" />
          </div>
        </div>

        <!-- 静态文本 -->
        <div
          v-else-if="field.type === 'static'"
          class="static-field"
          :class="field.class"
        >
          <span v-if="field.label" class="static-label">{{ field.label }}</span>
          <span class="static-value">
            {{ formData[field.field] || field.value }}
          </span>
        </div>

        <!-- 按钮 -->
        <button
          v-else-if="field.type === 'button'"
          :class="field.class || 'btn-form'"
          :disabled="field.disabled || false"
          @click="field.action && field.action()"
        >
          {{ field.label }}
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* 样式保持不变 */
.dynamic-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-label {
  font-size: 13px;
  font-weight: 500;
  color: #666;
}

.form-input {
  padding: 10px 14px;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  font-size: 15px;
  background: white;
  height: 40px;
  line-height: 20px;
  box-sizing: border-box;
}

.form-input:focus {
  outline: none;
  border-color: var(--v-color-primary, #003594);
}

.form-input:disabled {
  background: #f5f5f5;
  cursor: not-allowed;
}

.select-wrapper {
  position: relative;
}

.form-select {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 14px;
  background: white;
  color: #333;
  height: auto;
  line-height: normal;
  cursor: pointer;
  outline: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  appearance: auto;
  -webkit-appearance: auto;
  -moz-appearance: auto;
  vertical-align: middle;
  transition: all 0.2s ease;
}

.form-select:hover {
  border-color: #40a9ff;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.form-select:focus {
  border-color: #003594;
  box-shadow: 0 0 0 2px rgba(0, 53, 148, 0.1);
  outline: none;
}

.form-select:disabled {
  background: #f5f5f5;
  cursor: not-allowed;
  color: #999;
  border-color: #e8e8e8;
  box-shadow: none;
}

.form-select option {
  padding: 10px 12px;
  font-size: 14px;
  color: #333;
  background: white;
  min-height: 32px;
  transition: background-color 0.2s ease, color 0.2s ease;
}

.form-select option:hover {
  background: #f0f0f0 !important;
  color: #003594 !important;
}

.form-select option:checked {
  background: #e6f7ff !important;
  color: #003594 !important;
  font-weight: 500;
}

.form-select option:disabled {
  background: #fafafa !important;
  color: #d9d9d9 !important;
  cursor: not-allowed;
}

.range-wrapper {
  padding: 0;
}

.range-row {
  display: flex;
  align-items: center;
  gap: 10px;
  white-space: nowrap;
}

.form-range {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: #e0e0e0;
  outline: none;
  -webkit-appearance: none;
  cursor: pointer;
  max-width: calc(100% - 60px);
}

.form-range::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 2px;
  background: #e0e0e0;
  -webkit-appearance: none;
}

.form-range::-moz-range-track {
  height: 4px;
  border-radius: 2px;
  background: #e0e0e0;
  border: none;
}

.form-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--v-color-primary, #003594);
  cursor: pointer;
  border: 2px solid white;
  box-shadow: 0 1px 3px rgba(0,0,0,0.3);
  margin-top: -8px;
  transition: all 0.2s ease;
}

.form-range::-webkit-slider-thumb:hover {
  transform: scale(1.1);
  box-shadow: 0 2px 4px rgba(0,0,0,0.4);
}

.form-range::-moz-range-thumb {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--v-color-primary, #003594);
  cursor: pointer;
  border: 2px solid white;
  box-shadow: 0 1px 3px rgba(0,0,0,0.3);
  transition: all 0.2s ease;
}

.form-range::-moz-range-thumb:hover {
  transform: scale(1.1);
  box-shadow: 0 2px 4px rgba(0,0,0,0.4);
}

.form-range::-moz-range-progress {
  height: 4px;
  border-radius: 2px;
  background: var(--v-color-primary, #003594);
}

.range-value {
  font-size: 13px;
  color: #666;
  min-width: 40px;
  text-align: right;
}

.checkbox-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  cursor: pointer;
  user-select: none;
}

.checkbox-box {
  width: 18px;
  height: 18px;
  border: 1px solid #d9d9d9;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
  flex-shrink: 0;
}

.checkbox-box.checked {
  background: var(--v-color-primary, #003594);
  border-color: var(--v-color-primary, #003594);
}

.checkbox-box svg {
  width: 12px;
  height: 12px;
  color: white;
}

.checkbox-label {
  font-size: 14px;
  color: #333;
}

.switch-wrapper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
  cursor: pointer;
  user-select: none;
}

.switch-label {
  font-size: 14px;
  color: #333;
}

.switch-box {
  width: 44px;
  height: 24px;
  background: #ccc;
  border-radius: 12px;
  position: relative;
  flex-shrink: 0;
}

.switch-box.checked {
  background: var(--v-color-primary, #003594);
}

.switch-thumb {
  width: 20px;
  height: 20px;
  background: white;
  border-radius: 50%;
  position: absolute;
  top: 2px;
  left: 2px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.2);
}

.switch-box.checked .switch-thumb {
  left: 22px;
}

.static-field {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: #f8f8f8;
  border-radius: 6px;
  border: 1px solid #e8e8e8;
  height: 40px;
  box-sizing: border-box;
}

.static-field.section-title {
  background: var(--v-color-primary-light-bg, #e6f7ff);
  border-color: var(--v-color-primary, #003594);
  color: var(--v-color-primary, #003594);
  font-weight: 500;
  margin-top: 4px;
  font-size: 15px;
}

.static-label {
  font-size: 14px;
  color: #999;
}

.static-value {
  font-size: 15px;
  color: #333;
}

.btn-form {
  padding: 10px 18px;
  border: none;
  border-radius: 6px;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  background: var(--v-color-primary, #003594);
  color: white;
  height: 40px;
  box-sizing: border-box;
}

.btn-form:hover {
  background: var(--v-color-primary-dark, #002a7a);
}

.btn-form:disabled {
  background: #ccc;
  cursor: not-allowed;
}
</style>
