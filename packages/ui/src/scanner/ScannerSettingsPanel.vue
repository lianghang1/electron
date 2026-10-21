<script setup lang="ts">
import type { ScannerConfigView } from './use-scanner-config'
import { computed } from 'vue'
import ProfileSelectBar from '../devices/ProfileSelectBar.vue'
import ScannerDeviceForm from './ScannerDeviceForm.vue'
import { deviceLabel } from './use-scanner-config'

/**
 * 扫码枪设置面板：档案制紧凑形态（选择条 + 单表单），与其他设备域统一。
 * 总开关与激活档案随保存一并全量提交；节奏参数/通道随档案走
 */
const props = defineProps<{ state: ScannerConfigView }>()

const selectItems = computed(() =>
  props.state.devices.map(device => ({ value: device.id, label: deviceLabel(device) })),
)

function onActivate(): void {
  const device = props.state.selected
  if (!device) { return }
  props.state.setActive(device.id)
}

function onEnabledChange(event: Event): void {
  props.state.setEnabled((event.target as HTMLInputElement).checked)
}

function onSave(): void {
  void props.state.save()
}
</script>

<template>
  <div class="scn-body">
    <ProfileSelectBar
      :items="selectItems"
      :model-value="state.selectedId"
      :loading="state.loading"
      @update:model-value="state.select"
    />

    <section v-if="state.selected" class="scn-editor">
      <div class="scn-editor__head">
        <span class="scn-editor__name">{{ state.selected.displayName || '（未命名设备）' }}</span>
        <span class="scn-badge">{{ state.selected.transport === 'hid' ? 'HID 通道' : '键盘仿真' }}</span>
        <label class="scn-switch">
          <input
            type="radio"
            name="scn-active"
            :checked="state.activeId === state.selected.id"
            @change="onActivate"
          >
          <span>激活此设备</span>
        </label>
      </div>

      <ScannerDeviceForm :config="state.selected" />

      <div v-if="state.dirty" class="scn-note">
        有未保存修改
      </div>
    </section>
    <p v-else class="scn-empty">
      {{ state.loading ? '正在载入配置…' : '暂无设备档案（清单由代码出厂预设）' }}
    </p>

    <div class="scn-footer">
      <label class="scn-check">
        <input type="checkbox" :checked="state.enabled" @change="onEnabledChange">
        <span>启用扫码枪（关闭后等同普通键盘）</span>
      </label>
      <span class="scn-footer__hint">生效设备：{{ state.devices.find(d => d.id === state.activeId)?.displayName || '未选择' }}</span>
    </div>

    <div class="scn-actions">
      <button class="scn-btn" :disabled="state.saving || state.loading || !state.selected" @click="onSave">
        {{ state.saving ? '保存中…' : '保存' }}
      </button>
      <span v-if="state.message" class="scn-actions__msg">{{ state.message }}</span>
      <span v-if="state.error" class="scn-actions__err">{{ state.error }}</span>
    </div>
  </div>
</template>

<style scoped>
.scn-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 100%;
}

.scn-editor {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 14px 16px 16px;
  border: 1px solid #e6eaf0;
  border-radius: 10px;
}

.scn-editor__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 10px;
  border-bottom: 1px solid #f0f2f5;
}

.scn-editor__name {
  font-size: 13.5px;
  font-weight: 600;
  color: #1f2328;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scn-badge {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 7px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 600;
  line-height: 1;
  flex-shrink: 0;
  color: #57606a;
  background: #eceff3;
}

.scn-switch {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  color: #57606a;
  cursor: pointer;
  flex-shrink: 0;
}

.scn-check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #1f2328;
  cursor: pointer;
}

.scn-note {
  align-self: flex-start;
  font-size: 11.5px;
  color: #92400e;
  background: #fef3c7;
  border-radius: 8px;
  padding: 6px 10px;
}

.scn-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  border: 1px dashed #e0e5ec;
  border-radius: 10px;
  font-size: 12px;
  color: #a5adb8;
}

.scn-footer {
  display: flex;
  align-items: center;
  gap: 12px;
}

.scn-footer__hint {
  margin-left: auto;
  font-size: 11px;
  color: #a5adb8;
}

.scn-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.scn-actions__msg {
  font-size: 11.5px;
  color: #15803d;
}

.scn-actions__err {
  font-size: 11.5px;
  color: #b42318;
}

.scn-btn {
  border: 1px solid #d5dae1;
  border-radius: 8px;
  padding: 7px 18px;
  font-size: 12.5px;
  font-family: inherit;
  color: #1f2328;
  background: #fff;
  cursor: pointer;
  flex-shrink: 0;
  transition: background-color 0.12s, border-color 0.12s, opacity 0.12s;
}

.scn-btn:hover:not(:disabled) {
  border-color: #0f766e;
  color: #0f766e;
}

.scn-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
