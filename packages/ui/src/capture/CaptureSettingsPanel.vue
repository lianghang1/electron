<script setup lang="ts">
import type { CaptureConfigView, ConfigDeviceStatus } from './use-capture-config'
import UiScrollArea from '../scroll/UiScrollArea.vue'
import CaptureDeviceForm from './CaptureDeviceForm.vue'

/** 拍摄设置面板：纯展示体，状态由系统设置弹窗传入（body 区，不含弹窗 chrome 与底部操作区） */
const props = defineProps<{ state: CaptureConfigView }>()

/** 状态徽标元数据：文案 + 软底色配色（列表与编辑区头部分层展示用） */
const STATUS_META: Record<ConfigDeviceStatus, { label: string, text: string, bg: string }> = {
  ready: { label: '就绪', text: '#15803d', bg: '#dcfce7' },
  offline: { label: '离线', text: '#b45309', bg: '#fef3c7' },
  unavailable: { label: '不可用', text: '#57606a', bg: '#eceff3' },
  missing: { label: '未接入', text: '#8a919c', bg: '#f3f5f8' },
}

const TRANSPORT_LABEL: Record<string, string> = {
  ws: '高拍仪',
  dll: 'SDK 直连',
  service: '服务接入',
  wia: '扫描仪',
}

function onSnapTest(): void {
  void props.state.snapTest()
}
</script>

<template>
  <div class="cu-body">
    <aside class="cu-list">
      <UiScrollArea class="cu-list__scroll">
        <button
          v-for="config in state.configs"
          :key="config.id"
          class="cu-list__item"
          :class="{ 'cu-list__item--active': config.id === state.selectedId }"
          @click="state.select(config.id)"
        >
          <span class="cu-list__name">{{ config.displayName }}</span>
          <span class="cu-list__meta">
            <span
              class="cu-badge"
              :style="{ color: STATUS_META[state.statusOf(config)].text, background: STATUS_META[state.statusOf(config)].bg }"
            >{{ STATUS_META[state.statusOf(config)].label }}</span>
            <span class="cu-tag">{{ TRANSPORT_LABEL[config.transport] ?? config.transport }}</span>
          </span>
        </button>
      </UiScrollArea>
    </aside>

    <section v-if="state.selected" class="cu-editor">
      <div class="cu-editor__head">
        <span class="cu-editor__name">{{ state.selected.displayName }}</span>
        <span
          class="cu-badge"
          :style="{ color: STATUS_META[state.statusOf(state.selected)].text, background: STATUS_META[state.statusOf(state.selected)].bg }"
        >{{ STATUS_META[state.statusOf(state.selected)].label }}</span>
        <span class="cu-tag">{{ TRANSPORT_LABEL[state.selected.transport] ?? state.selected.transport }}</span>
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
      {{ state.loading ? '正在载入配置…' : '暂无可用设备配置' }}
    </p>
  </div>
</template>

<style scoped>
.cu-body {
  display: flex;
  gap: 16px;
  align-items: stretch;
  /* 填满系统设置弹窗的统一内容区高度（不足留白，超高交给外层滚动） */
  min-height: 100%;
}

/* ---- 左列表 ---- */
.cu-list {
  width: 224px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-self: flex-start;
  padding: 6px;
  border: 1px solid #e6eaf0;
  border-radius: 10px;
  background: #fbfcfd;
}

.cu-list__scroll {
  flex: 1;
  min-height: 0;
  max-height: 420px;
}

.cu-list__item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  border: none;
  background: transparent;
  padding: 8px 10px;
  border-radius: 8px;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.12s;
}

.cu-list__item + .cu-list__item {
  margin-top: 2px;
}

.cu-list__item:hover {
  background: #f0f3f7;
}

.cu-list__item--active {
  background: #d9efed;
}

.cu-list__item--active:hover {
  background: #d9efed;
}

.cu-list__name {
  font-size: 12.5px;
  font-weight: 500;
  color: #1f2328;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 徽标行：状态 + 接入方式分层展示 */
.cu-list__meta {
  display: flex;
  align-items: center;
  gap: 6px;
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

/* ---- 右编辑区 ---- */
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
</style>
