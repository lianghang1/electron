<script setup lang="ts">
import { TabsList, TabsRoot, TabsTrigger } from 'reka-ui'
import { computed, onMounted, ref, watch } from 'vue'
import CaptureSettingsPanel from '../capture/CaptureSettingsPanel.vue'
import { useCaptureConfig } from '../capture/use-capture-config'
import ConfigDialogShell from '../dialog/ConfigDialogShell.vue'
import ScannerSettingsPanel from '../scanner/ScannerSettingsPanel.vue'
import { useScannerConfig } from '../scanner/use-scanner-config'
import UiScrollArea from '../scroll/UiScrollArea.vue'

/** 页签 id：与 overlay 的 DeviceConfigKind 字面量对齐（'scanner' | 'capture'），新增页签同步扩展 */
type SettingsTab = 'scanner' | 'capture'

/**
 * 系统设置弹窗：左分组导航 + 右滚动内容区（参照主流设置页：分组竖导航 + 堆叠表单面板）。
 * 新增配置域 = 在 NAV_GROUPS 对应分组追加一条定义 + 一个面板组件 + 对应 composable；
 * 没有真实配置项的分组不渲染（不预留灰显占位），分组条目为空时整组隐藏。
 * 页签状态归本组件持有；各面板状态由对应 composable 提供（body 展示 + 底部操作区在此分发）。
 */
const props = defineProps<{ initialTab?: SettingsTab }>()

const emit = defineEmits<{ close: [] }>()

const NAV_GROUPS: { label: string, items: { id: SettingsTab, label: string }[] }[] = [
  {
    label: '设备',
    items: [
      { id: 'scanner', label: '扫码枪' },
      { id: 'capture', label: '拍摄' },
    ],
  },
]

/** TabsRoot 的 v-model 按 string 收发（reka 泛型为宽类型），页签判定用字面量比较 */
const activeTab = ref<string>(props.initialTab ?? 'scanner')

const scanner = useScannerConfig()
const capture = useCaptureConfig()

/** 当前页签存在未保存更改（内容区顶部黄条提示，不阻断操作） */
const activeDirty = computed(() => (activeTab.value === 'scanner' ? scanner.dirty : capture.dirty))

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
  <ConfigDialogShell title="系统设置" subtitle="设备与通用配置" @close="emit('close')">
    <div class="ss-layout">
      <TabsRoot v-model="activeTab" orientation="vertical">
        <TabsList class="ss-nav" aria-label="设置分类">
          <template v-for="group in NAV_GROUPS" :key="group.label">
            <div class="ss-nav__group">
              {{ group.label }}
            </div>
            <TabsTrigger
              v-for="tab in group.items"
              :key="tab.id"
              :value="tab.id"
              class="ss-nav__item"
            >
              {{ tab.label }}
            </TabsTrigger>
          </template>
        </TabsList>
      </TabsRoot>

      <div class="ss-main">
        <div v-if="activeDirty" class="ss-dirty">
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8 5.5v3.5m0 2.5h.01" />
            <path d="M6.96 2.58 1.6 12a1.2 1.2 0 0 0 1.04 1.8h10.72A1.2 1.2 0 0 0 14.4 12L9.04 2.58a1.2 1.2 0 0 0-2.08 0Z" />
          </svg>
          <span>当前更改尚未保存，点击下方「保存」后生效</span>
        </div>
        <UiScrollArea ref="paneRef" class="ss-pane">
          <div class="ss-pane__inner">
            <ScannerSettingsPanel v-show="activeTab === 'scanner'" v-model:config="scanner.config" :state="scanner" />
            <CaptureSettingsPanel v-show="activeTab === 'capture'" :state="capture" />
          </div>
        </UiScrollArea>
      </div>
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

/* ---- 左侧分组导航 ---- */
.ss-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 192px;
  flex-shrink: 0;
  margin: 0;
  padding: 14px 12px 14px 16px;
  border-right: 1px solid #f0f2f5;
}

.ss-nav__group {
  margin: 0 0 4px;
  padding: 0 10px;
  font-size: 11px;
  font-weight: 600;
  line-height: 16px;
  color: #a2aab6;
  letter-spacing: 0.05em;
  user-select: none;
}

.ss-nav__group + .ss-nav__item {
  margin-top: 0;
}

.ss-nav__item {
  border: none;
  background: transparent;
  text-align: left;
  padding: 0 10px;
  height: 32px;
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

.ss-nav__item:focus-visible {
  outline: 2px solid #99d5cf;
  outline-offset: -2px;
}

.ss-nav__item[data-state='active'] {
  color: #0f766e;
  font-weight: 500;
  background: #e9f1f0;
}

/* ---- 右侧内容区 ---- */
.ss-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.ss-dirty {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  margin: 12px 24px 0 20px;
  padding: 7px 10px;
  border: 1px solid #fde68a;
  border-radius: 8px;
  background: #fffbeb;
  font-size: 12px;
  line-height: 16px;
  color: #92400e;
}

.ss-dirty svg {
  flex-shrink: 0;
}

.ss-pane {
  flex: 1;
  min-height: 0;
}

.ss-pane__inner {
  padding: 16px 24px 24px 20px;
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
