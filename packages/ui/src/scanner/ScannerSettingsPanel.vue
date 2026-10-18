<script setup lang="ts">
import type { ScannerConfig } from '@desktop/shared'
import type { ScannerConfigView } from './use-scanner-config'
import { SwitchRoot, SwitchThumb } from 'reka-ui'
import { ref } from 'vue'

/** 扫码枪设置面板：分组卡片布局，每行「标题 + 描述」居左、控件居右 */
const props = defineProps<{ state: ScannerConfigView }>()

/** 经具名模型就地编辑弹窗持有的配置草稿（深改随共享引用同步回弹窗） */
const config = defineModel<ScannerConfig>('config', { required: true })

/** 前缀标签输入（回车添加） */
const prefixInput = ref('')

/** 模拟扫码测试码（默认带前缀，覆盖前缀命中链路） */
const testCode = ref('PB:1234567890')

function runTest(): void {
  const code = testCode.value.trim() || 'PB:1234567890'
  void props.state.simulate(code)
}

function addPrefix(): void {
  const value = prefixInput.value.trim()
  prefixInput.value = ''
  if (!value || config.value.prefixes.includes(value)) {
    return
  }
  config.value.prefixes = [...config.value.prefixes, value]
}

function removePrefix(prefix: string): void {
  config.value.prefixes = config.value.prefixes.filter(p => p !== prefix)
}
</script>

<template>
  <div class="sc-body">
    <section class="sc-group">
      <h4 class="sc-group__title">
        通用
      </h4>
      <div class="sc-card">
        <div class="sc-row">
          <div class="sc-row__text">
            <span class="sc-row__label">启用扫码识别</span>
            <span class="sc-row__desc">关闭后扫码枪作为普通键盘输入</span>
          </div>
          <SwitchRoot v-model="config.enabled" class="sc-switch">
            <SwitchThumb class="sc-switch__thumb" />
          </SwitchRoot>
        </div>
        <div class="sc-row">
          <div class="sc-row__text">
            <span class="sc-row__label">结束判定超时（ms）</span>
            <span class="sc-row__desc">无后续按键多久判定一次缓冲结束</span>
          </div>
          <input v-model.number="config.timeout" type="number" min="1" class="sc-input">
        </div>
        <div class="sc-row">
          <div class="sc-row__text">
            <span class="sc-row__label">最小条码长度</span>
            <span class="sc-row__desc">过滤人手误触</span>
          </div>
          <input v-model.number="config.minLength" type="number" min="0" class="sc-input">
        </div>
        <div class="sc-row">
          <div class="sc-row__text">
            <span class="sc-row__label">结束键</span>
            <span class="sc-row__desc">扫码枪扫码后追加的按键</span>
          </div>
          <input v-model="config.endKey" type="text" class="sc-input" placeholder="Enter">
        </div>
        <div class="sc-row">
          <div class="sc-row__text">
            <span class="sc-row__label">强制前缀命中</span>
            <span class="sc-row__desc">未命中前缀的输入不作为扫码结果</span>
          </div>
          <SwitchRoot v-model="config.requirePrefix" class="sc-switch">
            <SwitchThumb class="sc-switch__thumb" />
          </SwitchRoot>
        </div>
      </div>
    </section>

    <section class="sc-group">
      <h4 class="sc-group__title">
        前缀列表
      </h4>
      <div class="sc-card">
        <div class="sc-row sc-row--stack">
          <div class="sc-row__text">
            <span class="sc-row__label">条码前缀</span>
            <span class="sc-row__desc">用前缀区分单据类型（如 PB:），命中后扫码结果带 prefix</span>
          </div>
          <div class="sc-tags">
            <span v-for="p in config.prefixes" :key="p" class="sc-tag">
              {{ p }}
              <button class="sc-tag__del" title="删除" @click="removePrefix(p)">
                ×
              </button>
            </span>
            <input v-model="prefixInput" class="sc-tags__input" placeholder="输入前缀后回车添加" @keydown.enter.prevent="addPrefix">
          </div>
        </div>
      </div>
    </section>

    <section class="sc-group">
      <h4 class="sc-group__title">
        模拟扫码
      </h4>
      <div class="sc-card">
        <div class="sc-row">
          <div class="sc-row__text">
            <span class="sc-row__label">模拟测试</span>
            <span class="sc-row__desc">保存当前配置并模拟一次扫码（仅开发环境）</span>
          </div>
          <div class="sc-row__ctrl">
            <input
              v-model="testCode"
              type="text"
              class="sc-input sc-input--wide"
              placeholder="PB:1234567890"
              @keydown.enter.prevent="runTest"
            >
            <button class="sc-btn" :disabled="state.saving || state.testing || state.loading" @click="runTest">
              {{ state.testing ? '测试中…' : '测试' }}
            </button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.sc-body {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.sc-group__title {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: #1f2328;
}

.sc-card {
  border: 1px solid #e6eaf0;
  border-radius: 10px;
  background: #fff;
  overflow: hidden;
}

.sc-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 11px 14px;
}

.sc-row + .sc-row {
  border-top: 1px solid #eef1f5;
}

.sc-row--stack {
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
}

.sc-row__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.sc-row__label {
  font-size: 12.5px;
  color: #1f2328;
}

.sc-row__desc {
  font-size: 11px;
  line-height: 1.5;
  color: #8a919c;
}

.sc-row__ctrl {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.sc-input {
  width: 120px;
  border: 1px solid #d5dae1;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 12px;
  font-family: inherit;
  color: #1f2328;
  background: #fff;
  flex-shrink: 0;
  transition: border-color 0.12s;
}

.sc-input--wide {
  width: 200px;
}

.sc-input:hover,
.sc-input:focus {
  border-color: #0f766e;
  outline: none;
}

/* reka-ui Switch：轨道 + 滑块，选中态青玉色 */
.sc-switch {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: 34px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: #d5dae1;
  cursor: pointer;
  flex-shrink: 0;
  transition: background-color 0.15s;
}

.sc-switch[data-state='checked'] {
  background: #0f766e;
}

.sc-switch__thumb {
  display: block;
  width: 16px;
  height: 16px;
  margin-left: 2px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(2, 8, 20, 0.2);
  transition: transform 0.15s;
}

.sc-switch[data-state='checked'] .sc-switch__thumb {
  transform: translateX(14px);
}

.sc-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 4px 8px;
  border: 1px solid #d5dae1;
  border-radius: 8px;
  background: #fff;
}

.sc-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  background: #ccfbf1;
  color: #0f766e;
  font-size: 11.5px;
  font-weight: 600;
}

.sc-tag__del {
  border: none;
  background: transparent;
  padding: 0;
  width: 14px;
  height: 14px;
  line-height: 14px;
  font-size: 12px;
  color: #0f766e;
  cursor: pointer;
}

.sc-tag__del:hover {
  color: #dc2626;
}

.sc-tags__input {
  flex: 1;
  min-width: 140px;
  border: none;
  outline: none;
  font-size: 12px;
  font-family: inherit;
  background: transparent;
  color: #1f2328;
}

.sc-btn {
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

.sc-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
