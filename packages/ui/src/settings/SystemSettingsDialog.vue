<script setup lang="ts">
import { TabsList, TabsRoot, TabsTrigger } from 'reka-ui'
import { computed, onMounted, ref, watch } from 'vue'
import UiButton from '../button/UiButton.vue'
import CaptureSettingsPanel from '../capture/CaptureSettingsPanel.vue'
import { useCaptureConfig } from '../capture/use-capture-config'
import UiDialog from '../dialog/UiDialog.vue'
import IdCardSettingsPanel from '../idcard/IdCardSettingsPanel.vue'
import { useIdcardConfig } from '../idcard/use-idcard-config'
import ScannerSettingsPanel from '../scanner/ScannerSettingsPanel.vue'
import { useScannerConfig } from '../scanner/use-scanner-config'
import UiScrollArea from '../scroll/UiScrollArea.vue'
import SignatureSettingsPanel from '../signature/SignatureSettingsPanel.vue'
import { useSignatureConfig } from '../signature/use-signature-config'
/** 页签 id：与 overlay 的 DeviceConfigKind 字面量对齐（'scanner' | 'capture' | 'idcard' | 'signature'），新增页签同步扩展 */
type SettingsTab = 'scanner' | 'capture' | 'idcard' | 'signature'

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
      { id: 'idcard', label: '身份证读卡' },
      { id: 'signature', label: '签名屏' },
    ],
  },
]

/** TabsRoot 的 v-model 按 string 收发（reka 泛型为宽类型），页签判定用字面量比较 */
const activeTab = ref<string>(props.initialTab ?? 'scanner')

const scanner = useScannerConfig()
const capture = useCaptureConfig()
const idcard = useIdcardConfig()
const signature = useSignatureConfig()

/** 各页签的未保存标记与操作区状态（footer/feedback 按页签取用） */
const TAB_STATES = {
  scanner,
  capture,
  idcard,
  signature,
} as const

/** 当前页签存在未保存更改（内容区顶部黄条提示，不阻断操作） */
const activeDirty = computed(() => TAB_STATES[activeTab.value as SettingsTab]?.dirty ?? false)

/** 右侧内容滚动区：切换页签复位滚动位置 */
const paneRef = ref<InstanceType<typeof UiScrollArea> | null>(null)

watch(activeTab, () => {
  paneRef.value?.reset()
})

onMounted(() => {
  void scanner.load()
  void capture.load()
  void idcard.load()
  void signature.load()
})
</script>

<template>
  <UiDialog title="系统设置" subtitle="设备与通用配置" :width="880" :height="620" @close="emit('close')">
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
            <IdCardSettingsPanel v-show="activeTab === 'idcard'" v-model:config="idcard.config" :state="idcard" />
            <SignatureSettingsPanel v-show="activeTab === 'signature'" v-model:config="signature.config" :state="signature" />
          </div>
        </UiScrollArea>
      </div>
    </div>

    <template #feedback>
      <template v-for="tab in ['scanner', 'capture', 'idcard', 'signature'] as const" :key="tab">
        <span v-if="activeTab === tab && TAB_STATES[tab].message" class="ss-feedback-ok">{{ TAB_STATES[tab].message }}</span>
        <span v-else-if="activeTab === tab && TAB_STATES[tab].error" class="ss-feedback-err">{{ TAB_STATES[tab].error }}</span>
      </template>
    </template>
    <template #footer>
      <!-- 扫码枪/身份证/签名屏 = 纯保存型表单；拍摄页额外带设备档案删除 -->
      <UiButton
        v-if="activeTab !== 'capture'"
        variant="primary"
        :disabled="TAB_STATES[activeTab as SettingsTab].saving || TAB_STATES[activeTab as SettingsTab].loading"
        @click="TAB_STATES[activeTab as SettingsTab].save()"
      >
        {{ TAB_STATES[activeTab as SettingsTab].saving ? '保存中…' : '保存' }}
      </UiButton>
      <template v-else>
        <UiButton
          v-if="capture.selected"
          variant="danger"
          :solid="capture.confirmingRemove"
          :disabled="capture.saving"
          @click="capture.requestRemove()"
        >
          {{ capture.confirmingRemove ? '确认删除？' : '删除' }}
        </UiButton>
        <UiButton
          variant="primary"
          :disabled="!capture.selected || capture.saving || capture.loading"
          @click="capture.save()"
        >
          {{ capture.saving ? '保存中…' : '保存' }}
        </UiButton>
      </template>
    </template>
  </UiDialog>
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
</style>
