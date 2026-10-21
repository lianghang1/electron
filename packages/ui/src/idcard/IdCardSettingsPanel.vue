<script setup lang="ts">
import type { IdcardConfig } from '@desktop/shared'
import type { IdcardConfigView } from './use-idcard-config'

/** 身份证读卡设置面板：分组卡片布局，每行「标题 + 描述」居左、控件居右（与扫码枪面板同构） */
const props = defineProps<{ state: IdcardConfigView }>()

const config = defineModel<IdcardConfig>('config', { required: true })

void props
</script>

<template>
  <div class="idc-body">
    <section class="idc-group">
      <h4 class="idc-group__title">
        接入通道
      </h4>
      <div class="idc-card">
        <div class="idc-row">
          <div class="idc-row__text">
            <span class="idc-row__label">本地服务地址（ws 路线）</span>
            <span class="idc-row__desc">CamSDK 本地服务（CamSDKServer）的 ws 地址；DLL 直连读卡器不受此项影响</span>
          </div>
          <input v-model="config.wsUrl" type="text" class="idc-input idc-input--wide" placeholder="ws://127.0.0.1:9000">
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.idc-body {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.idc-group__title {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  line-height: 18px;
  color: #1f2328;
}

.idc-card {
  border: 1px solid #e6eaf0;
  border-radius: 10px;
  background: #fff;
  overflow: hidden;
}

.idc-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
}

.idc-row__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.idc-row__label {
  font-size: 13px;
  line-height: 18px;
  color: #1f2328;
}

.idc-row__desc {
  font-size: 12px;
  line-height: 1.5;
  color: #8a919c;
}

.idc-input {
  width: 120px;
  height: 30px;
  border: 1px solid #d5dae1;
  border-radius: 8px;
  padding: 0 10px;
  font-size: 12px;
  font-family: inherit;
  color: #1f2328;
  background: #fff;
  flex-shrink: 0;
  transition: border-color 0.12s;
}

.idc-input--wide {
  width: 220px;
}

.idc-input:hover,
.idc-input:focus {
  border-color: #0f766e;
  outline: none;
}
</style>
