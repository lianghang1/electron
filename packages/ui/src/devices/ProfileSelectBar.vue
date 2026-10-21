<script setup lang="ts">
/**
 * 设备档案选择条（设备设置面板统一紧凑形态的头部行）。
 * 档案清单由代码出厂预设锁死，本组件仅承担「选择」，不提供新增/删除入口。
 * 下拉选项 label 由调用方组装（名称 + 状态/通道后缀）。
 */
const props = defineProps<{
  items: { value: string, label: string }[]
  modelValue: string
  loading?: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
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
</style>
