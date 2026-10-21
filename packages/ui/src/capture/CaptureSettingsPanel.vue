<script setup lang="ts">
import type { CaptureDeviceConfig } from '@desktop/shared'
import type { CaptureConfigView } from './use-capture-config'
import { computed } from 'vue'
import ProfileSelectBar from '../devices/ProfileSelectBar.vue'
import { STATUS_META } from '../devices/status-meta'
import CaptureDeviceForm from './CaptureDeviceForm.vue'

/**
 * 拍摄设置面板：纯展示体，状态由系统设置弹窗传入（body 区，不含弹窗 chrome 与底部操作区）。
 * 紧凑形态：顶部档案选择条（下拉 + 新增/删除）+ 单表单编辑，与其他设备域统一
 */
const props = defineProps<{ state: CaptureConfigView }>()

const TRANSPORT_LABEL: Record<string, string> = {
  ws: '高拍仪',
  dll: 'SDK 直连',
  service: '服务接入',
  wia: '扫描仪',
}

/** 配置对应统一设备 id（与 Main 侧 "<transport>:<配置 id>" 约定同构） */
function deviceIdOf(config: CaptureDeviceConfig): string {
  return `${config.transport}:${config.id}`
}

function isDefault(config: CaptureDeviceConfig): boolean {
  return props.state.defaultDeviceId === deviceIdOf(config)
}

/** 下拉选项：名称 + 状态 + 接入方式（紧凑形态下状态并入选项文案） */
function optionLabel(config: CaptureDeviceConfig): string {
  const parts = [
    config.displayName || '（未命名设备）',
    STATUS_META[props.state.statusOf(config)].label,
    TRANSPORT_LABEL[config.transport] ?? config.transport,
  ]
  if (isDefault(config)) { parts.push('默认') }
  return parts.join(' · ')
}

const selectItems = computed(() =>
  props.state.configs.map(config => ({ value: config.id, label: optionLabel(config) })),
)

function onSnapTest(): void {
  void props.state.snapTest()
}

/** 设为/取消默认（作用于当前选中设备，取消 = 传 undefined） */
function onSetDefault(): void {
  const config = props.state.selected
  if (!config) { return }
  void props.state.setDefault(isDefault(config) ? undefined : deviceIdOf(config))
}
</script>

<template>
  <div class="cu-body">
    <ProfileSelectBar
      :items="selectItems"
      :model-value="state.selectedId"
      :loading="state.loading"
      @update:model-value="state.select"
    />

    <section v-if="state.selected" class="cu-editor">
      <div class="cu-editor__head">
        <span class="cu-editor__name">{{ state.selected.displayName || '（未命名设备）' }}</span>
        <span
          class="cu-badge"
          :style="{ color: STATUS_META[state.statusOf(state.selected)].text, background: STATUS_META[state.statusOf(state.selected)].bg }"
        >{{ STATUS_META[state.statusOf(state.selected)].label }}</span>
        <span v-if="isDefault(state.selected)" class="cu-badge cu-badge--default">默认</span>
        <span class="cu-tag">{{ TRANSPORT_LABEL[state.selected.transport] ?? state.selected.transport }}</span>
        <button
          class="cu-btn cu-btn--mini"
          :disabled="state.saving || state.loading"
          @click="onSetDefault"
        >
          {{ isDefault(state.selected) ? '取消默认' : '设为默认' }}
        </button>
        <span class="cu-editor__id" :title="state.selected.id">ID：{{ state.selected.id }}</span>
      </div>
      <CaptureDeviceForm :config="state.selected" />
      <div class="cu-test">
        <button
          class="cu-btn"
          :disabled="state.saving || state.snapping || state.loading"
          @click="onSnapTest"
        >
          {{ state.snapping ? '试拍中…' : '试拍' }}
        </button>
        <span class="cu-test__hint">保存当前配置并采集一张，验证连接参数</span>
        <img v-if="state.snapThumb" :src="state.snapThumb" class="cu-test__thumb" alt="试拍结果">
      </div>
    </section>
    <p v-else class="cu-empty">
      {{ state.loading ? '正在载入配置…' : '暂无设备档案（清单由代码出厂预设）' }}
    </p>
  </div>
</template>

<style scoped>
.cu-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  /* 填满系统设置弹窗的统一内容区高度（不足留白，超高交给外层滚动） */
  min-height: 100%;
}

/* ---- 编辑区 ---- */
.cu-editor {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 14px 16px 16px;
  border: 1px solid #e6eaf0;
  border-radius: 10px;
}

.cu-editor__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 10px;
  border-bottom: 1px solid #f0f2f5;
}

.cu-editor__name {
  font-size: 13.5px;
  font-weight: 600;
  color: #1f2328;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cu-editor__id {
  margin-left: auto;
  font-size: 11px;
  color: #a5adb8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  max-height: 120px;
  max-width: 40%;
  border-radius: 8px;
  border: 1px solid #e6eaf0;
}

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
  transition: background-color 0.12s, border-color 0.12s, opacity 0.12s;
}

.cu-btn:hover:not(:disabled) {
  border-color: #0f766e;
  color: #0f766e;
}

.cu-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

/* 编辑区头部的内联小号操作钮（设为/取消默认） */
.cu-btn--mini {
  padding: 3px 10px;
  font-size: 11px;
  border-radius: 6px;
}

.cu-badge {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 7px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 600;
  line-height: 1;
  flex-shrink: 0;
}

.cu-tag {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 7px;
  border-radius: 5px;
  border: 1px solid #e3e8ee;
  background: #fff;
  font-size: 10.5px;
  color: #57606a;
  line-height: 1;
  flex-shrink: 0;
}

/* 默认设备徽标（青色软底，与页签激活态同源） */
.cu-badge--default {
  color: #0f766e;
  background: #d9efed;
}
</style>
