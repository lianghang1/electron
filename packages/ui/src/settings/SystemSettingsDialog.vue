<script setup lang="ts">
import { onMounted, ref } from 'vue'
import CaptureSettingsPanel from '../capture/CaptureSettingsPanel.vue'
import { useCaptureConfig } from '../capture/use-capture-config'
import ConfigDialogShell from '../dialog/ConfigDialogShell.vue'
import ScannerSettingsPanel from '../scanner/ScannerSettingsPanel.vue'
import { useScannerConfig } from '../scanner/use-scanner-config'

/** 页签 id：与 overlay 的 DeviceConfigKind 字面量对齐（'scanner' | 'capture'），新增页签同步扩展 */
type SettingsTab = 'scanner' | 'capture'

/**
 * 系统设置弹窗：设备配置域统一入口，Tab 切换各配置面板。
 * 新增配置域 = 追加一条 TABS 定义 + 一个面板组件 + 对应 composable，弹窗骨架与契约不变。
 * 页签状态归本组件持有；各面板状态由对应 composable 提供（body 展示 + 底部操作区在此分发）。
 */
const props = defineProps<{ initialTab?: SettingsTab }>()

const emit = defineEmits<{ close: [] }>()

const TABS: { id: SettingsTab, label: string }[] = [
  { id: 'scanner', label: '扫码枪' },
  { id: 'capture', label: '拍摄' },
]

const activeTab = ref<SettingsTab>(props.initialTab ?? 'scanner')

const scanner = useScannerConfig()
const capture = useCaptureConfig()

onMounted(() => {
  void scanner.load()
  void capture.load()
})
</script>

<template>
  <ConfigDialogShell
    v-model:active-tab="activeTab"
    title="系统设置"
    :tabs="TABS"
    @close="emit('close')"
  >
    <ScannerSettingsPanel v-show="activeTab === 'scanner'" v-model:config="scanner.config" :state="scanner" />
    <CaptureSettingsPanel v-show="activeTab === 'capture'" :state="capture" />

    <template #feedback>
      <span v-if="activeTab === 'scanner' && scanner.message" class="ss-feedback-ok">{{ scanner.message }}</span>
      <span v-else-if="activeTab === 'scanner' && scanner.error" class="ss-feedback-err">{{ scanner.error }}</span>
      <span v-else-if="activeTab === 'capture' && capture.message" class="ss-feedback-ok">{{ capture.message }}</span>
      <span v-else-if="activeTab === 'capture' && capture.error" class="ss-feedback-err">{{ capture.error }}</span>
    </template>
    <template #footer>
      <button
        v-if="activeTab === 'scanner'"
        class="ss-btn ss-btn--primary"
        :disabled="scanner.saving || scanner.loading"
        @click="scanner.save()"
      >
        {{ scanner.saving ? '保存中…' : '保存' }}
      </button>
      <template v-else>
        <button
          v-if="capture.selected"
          class="ss-btn"
          :class="capture.confirmingRemove ? 'ss-btn--confirming' : 'ss-btn--danger'"
          :disabled="capture.saving"
          @click="capture.requestRemove()"
        >
          {{ capture.confirmingRemove ? '确认删除？' : '删除' }}
        </button>
        <button
          class="ss-btn ss-btn--primary"
          :disabled="!capture.selected || capture.saving || capture.loading"
          @click="capture.save()"
        >
          {{ capture.saving ? '保存中…' : '保存' }}
        </button>
      </template>
    </template>
  </ConfigDialogShell>
</template>

<style scoped>
.ss-feedback-ok {
  font-size: 12px;
  color: #0f766e;
}

.ss-feedback-err {
  font-size: 12px;
  color: #dc2626;
}

.ss-btn {
  border: 1px solid #d5dae1;
  border-radius: 8px;
  padding: 7px 18px;
  font-size: 12.5px;
  font-family: inherit;
  color: #1f2328;
  background: #fff;
  cursor: pointer;
  flex-shrink: 0;
  transition: background-color 0.12s, border-color 0.12s, color 0.12s, opacity 0.12s;
}

.ss-btn--danger:hover:not(:disabled):not(.ss-btn--confirming) {
  border-color: #dc2626;
  color: #dc2626;
}

.ss-btn--confirming {
  border-color: #dc2626;
  background: #dc2626;
  color: #fff;
}

.ss-btn--primary {
  border-color: #0f766e;
  background: #0f766e;
  color: #fff;
}

.ss-btn--primary:hover:not(:disabled) {
  border-color: #0d6a63;
  background: #0d6a63;
}

.ss-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
