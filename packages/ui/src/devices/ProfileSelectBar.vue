<script setup lang="ts">
/**
 * 设备档案选择条（设备设置面板统一紧凑形态的头部行）：
 * 「设备下拉 + 新增 + 删除」单行，替代平铺设备列表（面板空间敏感）。
 * 下拉选项 label 由调用方组装（名称 + 状态/通道后缀）；删除经两步确认（confirming 由调用方武装）。
 */
const props = defineProps<{
  items: { value: string, label: string }[]
  modelValue: string
  loading?: boolean
  disabled?: boolean
  /** 删除两步确认武装中（按钮变「确认删除？」） */
  confirmingRemove?: boolean
  removeDisabled?: boolean
  addLabel?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'add': []
  'remove': []
}>()

function onSelect(event: Event): void {
  emit('update:modelValue', (event.target as HTMLSelectElement).value)
}
</script>

<template>
  <div class="psb-bar">
    <select
      class="psb-select"
      :value="modelValue"
      :disabled="disabled || loading"
      @change="onSelect"
    >
      <option v-if="items.length === 0" value="">
        {{ loading ? '载入中…' : '暂无设备' }}
      </option>
      <option v-for="item in items" :key="item.value" :value="item.value">
        {{ item.label }}
      </option>
    </select>
    <button class="psb-btn" type="button" :disabled="disabled || loading" @click="emit('add')">
      {{ addLabel ?? '新增设备' }}
    </button>
    <button
      class="psb-btn psb-btn--danger"
      type="button"
      :disabled="disabled || loading || !modelValue || removeDisabled"
      @click="emit('remove')"
    >
      {{ confirmingRemove ? '确认删除？' : '删除' }}
    </button>
  </div>
</template>

<style scoped>
.psb-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.psb-select {
  flex: 1;
  min-width: 0;
  height: 30px;
  border: 1px solid #d5dae1;
  border-radius: 8px;
  padding: 0 8px;
  font-size: 12px;
  font-family: inherit;
  color: #1f2328;
  background: #fff;
  transition: border-color 0.12s;
}

.psb-select:hover,
.psb-select:focus {
  border-color: #0f766e;
  outline: none;
}

.psb-btn {
  flex-shrink: 0;
  height: 30px;
  padding: 0 12px;
  border: 1px solid #d5dae1;
  border-radius: 8px;
  background: #fff;
  color: #1f2328;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
  white-space: nowrap;
}

.psb-btn:hover:not(:disabled) {
  background: #f3f5f8;
}

.psb-btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.psb-btn--danger {
  color: #b42318;
}

.psb-btn--danger:hover:not(:disabled) {
  background: #fef3f2;
  border-color: #f4c7c3;
}
</style>
