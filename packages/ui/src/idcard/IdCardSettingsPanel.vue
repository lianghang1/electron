<script setup lang="ts">
import type { IdcardConfigView } from './use-idcard-config'
import { computed } from 'vue'
import DeviceProfileForm from '../devices/DeviceProfileForm.vue'
import ProfileSelectBar from '../devices/ProfileSelectBar.vue'
import { STATUS_META } from '../devices/status-meta'

/**
 * 身份证读卡设置面板：档案制紧凑形态（选择条 + 单表单），与其他设备域统一。
 * ws 档案 = CamSDK 服务连接；dll 档案 = 守护进程驱动（华视/科密），DLL 自动加载、参数预留
 */
const props = defineProps<{ state: IdcardConfigView }>()

/** 下拉选项：名称 + 状态（紧凑形态下状态并入选项文案） */
const selectItems = computed(() =>
  props.state.configs.map(config => ({
    value: config.id,
    label: [config.displayName || '（未命名设备）', STATUS_META[props.state.statusOf(config)].label].join(' · '),
  })),
)

function onSave(): void {
  void props.state.save()
}
</script>

<template>
  <div class="idc-body">
    <ProfileSelectBar
      :items="selectItems"
      :model-value="state.selectedId"
      :loading="state.loading"
      @update:model-value="state.select"
    />

    <section v-if="state.selected" class="idc-editor">
      <div class="idc-editor__head">
        <span class="idc-editor__name">{{ state.selected.displayName || '（未命名设备）' }}</span>
        <span
          class="idc-badge"
          :style="{ color: STATUS_META[state.statusOf(state.selected)].text, background: STATUS_META[state.statusOf(state.selected)].bg }"
        >{{ STATUS_META[state.statusOf(state.selected)].label }}</span>
        <span v-if="state.selected.transport === 'dll'" class="idc-badge idc-badge--dll">DLL 直连</span>
        <span class="idc-editor__id" :title="state.selected.id">ID：{{ state.selected.id }}</span>
      </div>

      <DeviceProfileForm
        :config="state.selected"
        name-placeholder="如：前台身份证阅读器"
        url-placeholder="ws://127.0.0.1:9000"
        url-hint="CamSDKServer 本地服务地址；一条连接枚举该服务下全部读卡器"
      />

      <div v-if="state.dirty" class="idc-note idc-note--dirty">
        有未保存修改
      </div>
    </section>
    <p v-else class="idc-empty">
      {{ state.loading ? '正在载入配置…' : '暂无设备档案（清单由代码出厂预设）' }}
    </p>

    <div class="idc-actions">
      <button class="idc-btn" :disabled="state.saving || state.loading || !state.selected" @click="onSave">
        {{ state.saving ? '保存中…' : '保存' }}
      </button>
      <span v-if="state.message" class="idc-actions__msg">{{ state.message }}</span>
      <span v-if="state.error" class="idc-actions__err">{{ state.error }}</span>
    </div>
  </div>
</template>

<style scoped>
.idc-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 100%;
}

.idc-editor {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 14px 16px 16px;
  border: 1px solid #e6eaf0;
  border-radius: 10px;
}

.idc-editor__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 10px;
  border-bottom: 1px solid #f0f2f5;
}

.idc-editor__name {
  font-size: 13.5px;
  font-weight: 600;
  color: #1f2328;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.idc-editor__id {
  margin-left: auto;
  font-size: 11px;
  color: #a5adb8;
  flex-shrink: 0;
}

.idc-badge {
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

.idc-badge--dll {
  color: #475569;
  background: #eef2f7;
}

.idc-note {
  font-size: 11.5px;
  color: #92400e;
  background: #fef3c7;
  border-radius: 8px;
  padding: 6px 10px;
}

.idc-note--dirty {
  align-self: flex-start;
}

.idc-empty {
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

.idc-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.idc-actions__msg {
  font-size: 11.5px;
  color: #15803d;
}

.idc-actions__err {
  font-size: 11.5px;
  color: #b42318;
}

.idc-btn {
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

.idc-btn:hover:not(:disabled) {
  border-color: #0f766e;
  color: #0f766e;
}

.idc-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
