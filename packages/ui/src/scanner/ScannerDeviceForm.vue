<script setup lang="ts">
import type { ScannerDeviceConfig } from '@desktop/shared'
import { computed } from 'vue'

/**
 * 扫码枪档案编辑表单：名称 + 节奏参数（随档案走）。
 * 经具名模型就地编辑面板持有的档案草稿，参照 CaptureDeviceForm 模式。
 * 档案清单与技术字段（品牌/通道）由代码出厂预设锁死，通道在编辑头徽标展示。
 */
const config = defineModel<ScannerDeviceConfig>('config', { required: true })

/** 前缀列表 ↔ 逗号分隔文本（数组不能直接 v-model） */
const prefixesText = computed({
  get: () => config.value.prefixes.join(', '),
  set: (value: string) => {
    config.value.prefixes = value.split(/[,，]/).map(s => s.trim()).filter(Boolean)
  },
})
</script>

<template>
  <div class="sdf-form">
    <label class="sdf-field">
      <span class="sdf-field__label">设备名称</span>
      <input v-model="config.displayName" type="text" class="sdf-input" placeholder="如：窗口扫码枪">
    </label>
    <div class="sdf-field">
      <span class="sdf-field__label">厂商（出厂预设）</span>
      <span class="sdf-static">{{ config.brand || '—' }}</span>
    </div>
    <label v-if="config.transport === 'hid'" class="sdf-field sdf-field--wide">
      <span class="sdf-field__label">HID 服务地址（ws）</span>
      <input v-model="config.hidUrl" type="text" class="sdf-input sdf-input--mono" placeholder="ws://127.0.0.1:9000">
    </label>

    <label class="sdf-field">
      <span class="sdf-field__label">字符间隔上限（ms）</span>
      <input v-model.number="config.timeout" type="number" min="1" class="sdf-input">
    </label>
    <label class="sdf-field">
      <span class="sdf-field__label">最小码长</span>
      <input v-model.number="config.minLength" type="number" min="0" class="sdf-input">
    </label>
    <label class="sdf-field">
      <span class="sdf-field__label">结束键</span>
      <input v-model="config.endKey" type="text" class="sdf-input" placeholder="Enter">
    </label>
    <label class="sdf-field">
      <span class="sdf-field__label">前缀标识（逗号分隔）</span>
      <input v-model="prefixesText" type="text" class="sdf-input sdf-input--mono" placeholder="如：^CTR，留空 = 不校验">
    </label>
    <div class="sdf-field sdf-field--check">
      <label class="sdf-check">
        <input v-model="config.requirePrefix" type="checkbox">
        <span>仅接受带前缀的条码</span>
      </label>
    </div>
  </div>
</template>

<style scoped>
.sdf-form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.sdf-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.sdf-field--wide {
  grid-column: 1 / -1;
}

.sdf-field--check {
  justify-content: flex-end;
}

.sdf-field__label {
  font-size: 11.5px;
  color: #57606a;
}

.sdf-static {
  display: flex;
  align-items: center;
  height: 30px;
  padding: 0 10px;
  border: 1px dashed #e3e8ee;
  border-radius: 8px;
  font-size: 12px;
  color: #57606a;
  background: #f6f8fa;
}

.sdf-input {
  height: 30px;
  border: 1px solid #d5dae1;
  border-radius: 8px;
  padding: 0 10px;
  font-size: 12px;
  font-family: inherit;
  color: #1f2328;
  background: #fff;
  min-width: 0;
  transition: border-color 0.12s;
}

.sdf-input--mono {
  font-family: Consolas, 'Cascadia Code', monospace;
}

.sdf-input:hover,
.sdf-input:focus {
  border-color: #0f766e;
  outline: none;
}

.sdf-check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #1f2328;
  cursor: pointer;
}
</style>
