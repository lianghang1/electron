<script setup lang="ts">
import type { SignatureConfig } from '@desktop/shared'
import type { SignatureConfigView } from './use-signature-config'

/** 签名屏设置面板：分组卡片布局，每行「标题 + 描述」居左、控件居右（与扫码枪面板同构） */
const props = defineProps<{ state: SignatureConfigView }>()

const config = defineModel<SignatureConfig>('config', { required: true })

void props
</script>

<template>
  <div class="sgn-body">
    <section class="sgn-group">
      <h4 class="sgn-group__title">
        接入通道
      </h4>
      <div class="sgn-card">
        <div class="sgn-row">
          <div class="sgn-row__text">
            <span class="sgn-row__label">本地服务地址（ws 路线）</span>
            <span class="sgn-row__desc">CamSDK 本地服务（CamSDKServer）的 ws 地址；签名图/指纹图由 PadViewer 回推</span>
          </div>
          <input v-model="config.wsUrl" type="text" class="sgn-input sgn-input--wide" placeholder="ws://127.0.0.1:9000">
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.sgn-body {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.sgn-group__title {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  line-height: 18px;
  color: #1f2328;
}

.sgn-card {
  border: 1px solid #e6eaf0;
  border-radius: 10px;
  background: #fff;
  overflow: hidden;
}

.sgn-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
}

.sgn-row__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.sgn-row__label {
  font-size: 13px;
  line-height: 18px;
  color: #1f2328;
}

.sgn-row__desc {
  font-size: 12px;
  line-height: 1.5;
  color: #8a919c;
}

.sgn-input {
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

.sgn-input--wide {
  width: 220px;
}

.sgn-input:hover,
.sgn-input:focus {
  border-color: #0f766e;
  outline: none;
}
</style>
