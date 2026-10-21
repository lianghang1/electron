<script setup lang="ts">
import type { SignatureConfigView } from './use-signature-config'
import { computed } from 'vue'
import DeviceProfileForm from '../devices/DeviceProfileForm.vue'
import ProfileSelectBar from '../devices/ProfileSelectBar.vue'
import { STATUS_META } from '../devices/status-meta'

/**
 * 签名屏设置面板：档案制紧凑形态（选择条 + 单表单），与其他设备域统一。
 * ws 档案 = CamSDK 服务连接；dll 档案 = 守护进程驱动（汉王签名板），DLL 自动加载、参数预留
 */
const props = defineProps<{ state: SignatureConfigView }>()

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
  <div class="sgn-body">
    <ProfileSelectBar
      :items="selectItems"
      :model-value="state.selectedId"
      :loading="state.loading"
      @update:model-value="state.select"
    />

    <section v-if="state.selected" class="sgn-editor">
      <div class="sgn-editor__head">
        <span class="sgn-editor__name">{{ state.selected.displayName || '（未命名设备）' }}</span>
        <span
          class="sgn-badge"
          :style="{ color: STATUS_META[state.statusOf(state.selected)].text, background: STATUS_META[state.statusOf(state.selected)].bg }"
        >{{ STATUS_META[state.statusOf(state.selected)].label }}</span>
        <span v-if="state.selected.transport === 'dll'" class="sgn-badge sgn-badge--dll">DLL 直连</span>
        <span class="sgn-editor__id" :title="state.selected.id">ID：{{ state.selected.id }}</span>
      </div>

      <DeviceProfileForm
        :config="state.selected"
        name-placeholder="如：窗口签名屏"
        url-placeholder="ws://127.0.0.1:9000"
        url-hint="CamSDKServer 本地服务地址；一条连接枚举该服务下全部签名屏，签名图/指纹图由设备回传"
      />

      <div v-if="state.dirty" class="sgn-note">
        有未保存修改
      </div>
    </section>
    <p v-else class="sgn-empty">
      {{ state.loading ? '正在载入配置…' : '暂无设备档案（清单由代码出厂预设）' }}
    </p>

    <div class="sgn-actions">
      <button class="sgn-btn" :disabled="state.saving || state.loading || !state.selected" @click="onSave">
        {{ state.saving ? '保存中…' : '保存' }}
      </button>
      <span v-if="state.message" class="sgn-actions__msg">{{ state.message }}</span>
      <span v-if="state.error" class="sgn-actions__err">{{ state.error }}</span>
    </div>
  </div>
</template>

<style scoped>
.sgn-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 100%;
}

.sgn-editor {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 14px 16px 16px;
  border: 1px solid #e6eaf0;
  border-radius: 10px;
}

.sgn-editor__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 10px;
  border-bottom: 1px solid #f0f2f5;
}

.sgn-editor__name {
  font-size: 13.5px;
  font-weight: 600;
  color: #1f2328;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sgn-editor__id {
  margin-left: auto;
  font-size: 11px;
  color: #a5adb8;
  flex-shrink: 0;
}

.sgn-badge {
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

.sgn-note {
  align-self: flex-start;
  font-size: 11.5px;
  color: #92400e;
  background: #fef3c7;
  border-radius: 8px;
  padding: 6px 10px;
}

.sgn-badge--dll {
  color: #475569;
  background: #eef2f7;
}

.sgn-empty {
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

.sgn-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.sgn-actions__msg {
  font-size: 11.5px;
  color: #15803d;
}

.sgn-actions__err {
  font-size: 11.5px;
  color: #b42318;
}

.sgn-btn {
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

.sgn-btn:hover:not(:disabled) {
  border-color: #0f766e;
  color: #0f766e;
}

.sgn-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
