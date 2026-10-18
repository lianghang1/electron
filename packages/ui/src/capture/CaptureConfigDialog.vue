<script setup lang="ts">
import type { ConfigDeviceStatus } from './use-capture-config'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import ConfigDialogShell from '../dialog/ConfigDialogShell.vue'
import CaptureDeviceForm from './CaptureDeviceForm.vue'
import { useCaptureConfig } from './use-capture-config'

const emit = defineEmits<{ close: [] }>()

const {
  configs,
  selectedId,
  loading,
  saving,
  message,
  error,
  selected,
  statusOf,
  load,
  select,
  save,
  remove,
  snapping,
  snapThumb,
  snapTest,
} = useCaptureConfig()

const STATUS_META: Record<ConfigDeviceStatus, { label: string, color: string }> = {
  ready: { label: '就绪', color: '#22c55e' },
  offline: { label: '离线', color: '#f59e0b' },
  unavailable: { label: '不可用', color: '#6b7688' },
  missing: { label: '未接入', color: '#d1d5db' },
}

const TRANSPORT_LABEL: Record<string, string> = {
  ws: '高拍仪',
  dll: 'SDK 直连',
  service: '服务接入',
  wia: '扫描仪',
}

const selectedStatus = computed(() => (selected.value ? STATUS_META[statusOf(selected.value)] : null))

/** 删除两步确认：按钮点击一次变「确认删除」，3s 未确认自动复位（避免引入弹窗组件） */
const confirmingRemove = ref(false)
let removeTimer: ReturnType<typeof setTimeout> | null = null

function onRemoveClick(): void {
  if (confirmingRemove.value) {
    resetRemoveConfirm()
    void remove()
    return
  }
  confirmingRemove.value = true
  removeTimer = setTimeout(() => {
    confirmingRemove.value = false
    removeTimer = null
  }, 3000)
}

function resetRemoveConfirm(): void {
  confirmingRemove.value = false
  if (removeTimer) {
    clearTimeout(removeTimer)
    removeTimer = null
  }
}

function onSnapTest(): void {
  void snapTest()
}

onMounted(() => {
  void load()
})

onBeforeUnmount(resetRemoveConfirm)
</script>

<template>
  <ConfigDialogShell
    title="拍摄设备配置"
    subtitle="高拍仪 / 扫描仪接入参数，保存后立即生效（热重建适配器）"
    @close="emit('close')"
  >
    <div class="cu-body">
      <aside class="cu-list">
        <button
          v-for="config in configs" :key="config.id"
          class="cu-list__item"
          :class="{ 'cu-list__item--active': config.id === selectedId }"
          @click="select(config.id)"
        >
          <span class="cu-list__status" :style="{ background: STATUS_META[statusOf(config)].color }" />
          <span class="cu-list__main">
            <span class="cu-list__name">{{ config.displayName }}</span>
            <span class="cu-list__meta">
              {{ TRANSPORT_LABEL[config.transport] ?? config.transport }} · {{ STATUS_META[statusOf(config)].label }}
            </span>
          </span>
        </button>
      </aside>

      <section v-if="selected" class="cu-editor">
        <div class="cu-editor__head">
          <span class="cu-editor__id" :title="selected.id">ID：{{ selected.id }}</span>
          <span v-if="selectedStatus" class="cu-editor__status" :style="{ color: selectedStatus.color }">
            {{ selectedStatus.label }}
          </span>
        </div>
        <CaptureDeviceForm :config="selected" />
        <div class="cu-test">
          <button
            class="cu-btn"
            :disabled="saving || snapping || loading"
            @click="onSnapTest"
          >
            {{ snapping ? '试拍中…' : '试拍' }}
          </button>
          <span class="cu-test__hint">保存当前配置并采集一张，验证连接参数</span>
          <img v-if="snapThumb" :src="snapThumb" class="cu-test__thumb" alt="试拍结果">
        </div>
      </section>
      <p v-else class="cu-empty">
        {{ loading ? '正在载入配置…' : '暂无可用设备配置' }}
      </p>
    </div>

    <template #feedback>
      <span v-if="message" class="cu-feedback-ok">{{ message }}</span>
      <span v-if="error" class="cu-feedback-err">{{ error }}</span>
    </template>
    <template #footer>
      <button
        v-if="selected"
        class="cu-btn cu-btn--danger"
        :class="{ 'cu-btn--confirming': confirmingRemove }"
        :disabled="saving"
        @click="onRemoveClick"
      >
        {{ confirmingRemove ? '确认删除？' : '删除' }}
      </button>
      <button class="cu-btn cu-btn--primary" :disabled="!selected || saving || loading" @click="save">
        {{ saving ? '保存中…' : '保存' }}
      </button>
    </template>
  </ConfigDialogShell>
</template>

<style scoped>
.cu-body {
  display: flex;
  gap: 14px;
  align-items: stretch;
  min-height: 300px;
}

/* ---- 左列表 ---- */
.cu-list {
  width: 216px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
  border: 1px solid #e6eaf0;
  border-radius: 10px;
  overflow-y: auto;
}

.cu-list__item {
  display: flex;
  align-items: center;
  gap: 8px;
  border: none;
  background: transparent;
  padding: 8px 9px;
  border-radius: 8px;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.12s;
}

.cu-list__item:hover {
  background: #f3f6f9;
}

.cu-list__item--active {
  background: #ccfbf1;
}

.cu-list__status {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.cu-list__main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.cu-list__name {
  font-size: 12.5px;
  color: #1f2328;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cu-list__meta {
  font-size: 11px;
  color: #8a919c;
}

/* ---- 右编辑区 ---- */
.cu-editor {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid #e6eaf0;
  border-radius: 10px;
  overflow-y: auto;
}

.cu-editor__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.cu-editor__id {
  font-size: 11px;
  color: #a5adb8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cu-editor__status {
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}

.cu-empty {
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

/* ---- 试拍测试区 ---- */
.cu-test {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-top: 12px;
  margin-top: auto;
  border-top: 1px solid #eef1f5;
}

.cu-test__hint {
  font-size: 11px;
  color: #8a919c;
}

.cu-test__thumb {
  margin-left: auto;
  max-height: 140px;
  max-width: 45%;
  border-radius: 8px;
  border: 1px solid #e6eaf0;
}

.cu-feedback-ok {
  font-size: 12px;
  color: #0f766e;
}

.cu-feedback-err {
  font-size: 12px;
  color: #dc2626;
}

/* ---- 操作按钮 ---- */
.cu-btn {
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

.cu-btn--danger:hover:not(:disabled):not(.cu-btn--confirming) {
  border-color: #dc2626;
  color: #dc2626;
}

.cu-btn--confirming {
  border-color: #dc2626;
  background: #dc2626;
  color: #fff;
}

.cu-btn--primary {
  border-color: #0f766e;
  background: #0f766e;
  color: #fff;
}

.cu-btn--primary:hover:not(:disabled) {
  border-color: #0d6a63;
  background: #0d6a63;
}

.cu-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
