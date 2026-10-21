<script setup lang="ts">
import type { ScannerConfigView } from './use-scanner-config'
import { computed } from 'vue'
import ProfileSelectBar from '../devices/ProfileSelectBar.vue'
import ScannerDeviceForm from './ScannerDeviceForm.vue'
import { deviceLabel } from './use-scanner-config'

/**
 * 扫码枪设置面板：档案制紧凑形态（选择条 + 单表单），与其他设备域统一。
 * 总开关与激活档案随自动保存一并全量提交；节奏参数/通道随档案走
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
</style>
