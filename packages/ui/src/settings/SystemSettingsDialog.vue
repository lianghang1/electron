<script setup lang="ts">
import { TabsList, TabsRoot, TabsTrigger } from 'reka-ui'
import { onMounted, ref, watch } from 'vue'
import CaptureSettingsPanel from '../capture/CaptureSettingsPanel.vue'
import { useCaptureConfig } from '../capture/use-capture-config'
import ConfigDialogShell from '../dialog/ConfigDialogShell.vue'
import ScannerSettingsPanel from '../scanner/ScannerSettingsPanel.vue'
import { useScannerConfig } from '../scanner/use-scanner-config'
import UiScrollArea from '../scroll/UiScrollArea.vue'

/** 页签 id：与 overlay 的 DeviceConfigKind 字面量对齐（'scanner' | 'capture'），新增页签同步扩展 */
type SettingsTab = 'scanner' | 'capture'

/**
 * 系统设置弹窗：设备配置域统一入口，左侧导航切换各配置面板（布局参照主流设置页：
 * 左侧竖导航 + 右侧分组卡片内容区）。
 * 新增配置域 = 追加一条 TABS 定义 + 一个面板组件 + 对应 composable，弹窗骨架与契约不变。
 * 页签状态归本组件持有；各面板状态由对应 composable 提供（body 展示 + 底部操作区在此分发）。
 */
const props = defineProps<{ initialTab?: SettingsTab }>()

const emit = defineEmits<{ close: [] }>()

const TABS: { id: SettingsTab, label: string }[] = [
  { id: 'scanner', label: '扫码枪' },
  { id: 'capture', label: '拍摄' },
]

/** TabsRoot 的 v-model 按 string 收发（reka 泛型为宽类型），页签判定用字面量比较 */
const activeTab = ref<string>(props.initialTab ?? 'scanner')

const scanner = useScannerConfig()
const capture = useCaptureConfig()

/** 右侧内容滚动区：切换页签复位滚动位置 */
const paneRef = ref<InstanceType<typeof UiScrollArea> | null>(null)

watch(activeTab, () => {
  paneRef.value?.reset()
})

onMounted(() => {
  void scanner.load()
  void capture.load()
})
</script>

<template>
  <ConfigDialogShell title="系统设置" :body-height="440" @close="emit('close')">
    <div class="ss-layout">
      <TabsRoot v-model="activeTab" orientation="vertical">
        <TabsList class="ss-nav" aria-label="设置分类">
          <TabsTrigger v-for="tab in TABS" :key="tab.id" :value="tab.id" class="ss-nav__item">
            {{ tab.label }}
          </TabsTrigger>
        </TabsList>
      </TabsRoot>
      <UiScrollArea ref="paneRef" class="ss-pane">
        <div class="ss-pane__inner">
          <ScannerSettingsPanel v-show="activeTab === 'scanner'" v-model:config="scanner.config" :state="scanner" />
          <CaptureSettingsPanel v-show="activeTab === 'capture'" :state="capture" />
        </div>
      </UiScrollArea>
    </div>

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
.ss-layout {
  display: flex;
  height: 100%;
}

/* ---- 左侧导航 ---- */
.ss-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 132px;
  flex-shrink: 0;
  margin: 0;
  padding-right: 12px;
  border-right: 1px solid #eef1f5;
}

.ss-nav__item {
  border: none;
  background: transparent;
  text-align: left;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px;
  font-family: inherit;
  color: #5f6673;
  cursor: pointer;
  flex-shrink: 0;
  transition: background-color 0.12s, color 0.12s;
}

.ss-nav__item:hover {
  color: #1f2328;
  background: #f3f6f9;
}

.ss-nav__item[data-state='active'] {
  color: #0f766e;
  font-weight: 500;
  background: #e9f1f0;
}

/* ---- 右侧内容区 ---- */
.ss-pane {
  flex: 1;
  min-width: 0;
}

.ss-pane__inner {
  padding: 2px 2px 2px 18px;
}

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
