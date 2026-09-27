<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { playSpeech } from '../composables/use-speech'
import FhModal from './FhModal.vue'
import NumPad from './NumPad.vue'

/**
 * 共享查询面板（业务缴费 / 电子火化证两页复用）：
 * 扫码提示 + 证件号软键盘输入。扫码识别由 App.vue 的扫码枪 HID 流全局分发，
 * 本组件只负责引导与证件号录入校验，通过后 emit query 交页面查单跳转。
 */
const props = withDefaults(defineProps<{
  /** 扫码 Tab 语音提示（挂载与切 Tab 时播报） */
  scanVoice: string
  /** 证件 Tab 语音提示（scanOnly 模式可省略） */
  idcardVoice?: string
  /** 扫码提示条目 */
  scanTips?: string[]
  /** 仅扫码模式（如扫码开票入口，无证件录入） */
  scanOnly?: boolean
}>(), {
  scanTips: () => [
    '办理前，请备好您的业务单',
    '请勿将手指或非业务单物品放入扫描区',
    '如需帮助，请咨询工作人员',
  ],
  scanOnly: false,
  idcardVoice: '',
})

const emit = defineEmits<{ query: [value: string] }>()

type Tab = 'scan' | 'idcard'

const activeTab = ref<Tab>('scan')
const certType = ref<'idcard' | 'other'>('idcard')
const value = ref('')

const modalVisible = ref(false)
const modalType = ref<'info' | 'error'>('error')
const modalMessage = ref('')

function showModal(type: 'info' | 'error', message: string): void {
  modalType.value = type
  modalMessage.value = message
  modalVisible.value = true
}

/** 身份证 6+8+4 分组展示，其他证件原样 */
const displayText = computed(() => {
  const val = value.value
  if (certType.value !== 'idcard' || val.length <= 6)
    return val
  if (val.length <= 14)
    return `${val.slice(0, 6)} ${val.slice(6)}`
  return `${val.slice(0, 6)} ${val.slice(6, 14)} ${val.slice(14)}`
})

const placeholder = computed(() => (certType.value === 'idcard' ? '请输入逝者身份证号码' : '请输入逝者证件号码'))

/** 输入进度（0-100）：身份证以 15/18 位为目标，其他证件最少 3 位 */
const progress = computed(() => {
  const len = value.value.length
  if (certType.value === 'idcard') {
    const targetLength = len <= 15 ? 15 : 18
    return Math.min((len / targetLength) * 100, 100)
  }
  if (len < 3)
    return (len / 3) * 100
  return 100
})

const progressText = computed(() => `${value.value.length}位`)

function handleTabChange(tab: Tab): void {
  activeTab.value = tab
  value.value = ''
  certType.value = 'idcard'
  void playSpeech(tab === 'scan' ? props.scanVoice : props.idcardVoice)
}

function handleCertTypeChange(type: 'idcard' | 'other'): void {
  certType.value = type
  value.value = ''
  void playSpeech(type === 'idcard' ? '请输入逝者身份证号码' : '请输入逝者证件号码')
}

function handleKey(key: string): void {
  if (certType.value === 'idcard') {
    // 身份证：不足 15 位上限 15，满 15 后允许补足 18（X 仅末位，超出被忽略）
    const maxLength = value.value.length < 15 ? 15 : 18
    if (value.value.length < maxLength)
      value.value += key
  }
  else if (value.value.length < 20) {
    value.value += key
  }
}

function backspace(): void {
  value.value = value.value.slice(0, -1)
}

function clear(): void {
  value.value = ''
}

function handleQuery(): void {
  const val = value.value.trim()
  if (!val) {
    showModal('error', certType.value === 'idcard' ? '请输入逝者身份证号码' : '请输入逝者证件号码')
    return
  }
  if (certType.value === 'idcard') {
    if (!/^\d{15}$|^\d{17}[\dX]$/i.test(val)) {
      showModal('error', '请输入正确的逝者身份证号码（15位或18位）')
      return
    }
  }
  else if (val.length < 3) {
    showModal('error', '请输入至少3位字符的证件号码')
    return
  }
  emit('query', val)
}

onMounted(() => {
  void playSpeech(props.scanVoice)
})
</script>

<template>
  <div class="fh-qp">
    <div v-if="!scanOnly" class="fh-qp__tabs">
      <button class="fh-qp__tab" :class="{ 'is-active': activeTab === 'scan' }" @click="handleTabChange('scan')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
          <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
          <path d="M4 12h16" />
        </svg>
        <span class="fh-qp__tab-title">扫码查询</span>
      </button>
      <button class="fh-qp__tab" :class="{ 'is-active': activeTab === 'idcard' }" @click="handleTabChange('idcard')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="9" cy="11" r="2" />
          <path d="M14.5 9.5h4M14.5 13h4M6 16h12" />
        </svg>
        <span class="fh-qp__tab-title">证件查询</span>
      </button>
    </div>

    <!-- 扫码引导 -->
    <div v-show="activeTab === 'scan'" class="fh-qp__scan">
      <div class="fh-qp__frame">
        <!-- 二维码示意：定位角 + 模块点阵，引导放置位置 -->
        <svg class="fh-qp__qr" viewBox="0 0 84 84" aria-hidden="true">
          <g fill="none" stroke="currentColor" stroke-width="3">
            <path d="M4 4h18v18H4zM62 4h18v18H62zM4 62h18v18H4z" />
          </g>
          <g fill="currentColor">
            <rect x="10" y="10" width="6" height="6" />
            <rect x="68" y="10" width="6" height="6" />
            <rect x="10" y="68" width="6" height="6" />
            <rect x="36" y="8" width="5" height="5" />
            <rect x="44" y="14" width="5" height="5" />
            <rect x="36" y="22" width="5" height="5" />
            <rect x="52" y="36" width="5" height="5" />
            <rect x="60" y="44" width="5" height="5" />
            <rect x="36" y="36" width="5" height="5" />
            <rect x="8" y="36" width="5" height="5" />
            <rect x="16" y="44" width="5" height="5" />
            <rect x="36" y="52" width="5" height="5" />
            <rect x="44" y="60" width="5" height="5" />
            <rect x="52" y="68" width="5" height="5" />
            <rect x="36" y="72" width="5" height="5" />
            <rect x="64" y="60" width="5" height="5" />
            <rect x="72" y="70" width="5" height="5" />
            <rect x="60" y="24" width="5" height="5" />
          </g>
        </svg>
        <div class="fh-qp__beam" />
        <span class="fh-qp__corner fh-qp__corner--tl" />
        <span class="fh-qp__corner fh-qp__corner--tr" />
        <span class="fh-qp__corner fh-qp__corner--bl" />
        <span class="fh-qp__corner fh-qp__corner--br" />
      </div>
      <div class="fh-qp__scan-info">
        <h3 class="fh-qp__scan-title">
          请将业务单二维码朝下
        </h3>
        <p class="fh-qp__scan-desc">
          置于屏幕下方的扫码区，听到“滴”声即完成扫描
        </p>
        <div class="fh-qp__tips">
          <div v-for="tip in scanTips" :key="tip" class="fh-qp__tip">
            <span class="fh-qp__tip-dot" />
            <span>{{ tip }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 证件号录入：左输入列 + 右软键盘双列布局 -->
    <div v-show="activeTab === 'idcard' && !scanOnly" class="fh-qp__cert">
      <div class="fh-qp__cert-left">
        <div class="fh-qp__cert-tabs">
          <button class="fh-qp__cert-tab" :class="{ 'is-active': certType === 'idcard' }" @click="handleCertTypeChange('idcard')">
            身份证
          </button>
          <button class="fh-qp__cert-tab" :class="{ 'is-active': certType === 'other' }" @click="handleCertTypeChange('other')">
            其他证件
          </button>
        </div>

        <div class="fh-qp__display">
          <span class="fh-qp__display-text" :class="{ 'is-empty': !value }">{{ displayText || placeholder }}</span>
          <span class="fh-qp__display-actions">
            <button class="fh-qp__mini-btn" :disabled="!value" @click="clear">
              清空
            </button>
            <button class="fh-qp__mini-btn" :disabled="!value" @click="backspace">
              退格
            </button>
          </span>
        </div>

        <div class="fh-qp__progress">
          <div class="fh-qp__progress-bar">
            <div class="fh-qp__progress-fill" :class="{ 'is-full': progress >= 100 }" :style="{ width: `${progress}%` }" />
          </div>
          <span class="fh-qp__progress-text">{{ progressText }}</span>
        </div>

        <button class="fh-btn fh-btn--primary fh-qp__confirm" @click="handleQuery">
          确认查询
        </button>
      </div>

      <NumPad @key="handleKey" />
    </div>

    <FhModal v-model:visible="modalVisible" :type="modalType" :message="modalMessage" />
  </div>
</template>

<style scoped>
.fh-qp {
  width: 100%;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* ---- Tab 切换：分段控件 ---- */

.fh-qp__tabs {
  display: flex;
  justify-content: center;
  margin-bottom: 28px;
}

.fh-qp__tab {
  display: flex;
  align-items: center;
  height: 56px;
  padding: 0 36px;
  background: var(--fh-surface);
  border: 1px solid var(--fh-line-strong);
  font-family: inherit;
  font-size: 17px;
  font-weight: 600;
  color: var(--fh-text-2);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.fh-qp__tab:first-child {
  border-radius: var(--fh-radius) 0 0 var(--fh-radius);
}

.fh-qp__tab:last-child {
  border-radius: 0 var(--fh-radius) var(--fh-radius) 0;
  border-left: none;
}

.fh-qp__tab svg {
  width: 22px;
  height: 22px;
  margin-right: 10px;
  transition: color 0.15s ease;
}

.fh-qp__tab.is-active {
  background: var(--fh-ink);
  border-color: var(--fh-ink);
  color: #fff;
}

.fh-qp__tab-title {
  font-size: 17px;
  font-weight: 600;
  color: inherit;
}

/* ---- 扫码引导 ---- */

.fh-qp__scan {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.fh-qp__scan .fh-qp__frame {
  margin-right: 64px;
}

.fh-qp__frame {
  position: relative;
  width: 300px;
  height: 300px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(rgb(43 54 72 / 7%) 1px, transparent 1px) 0 0 / 22px 22px,
    #ffffff;
  border-radius: var(--fh-radius-lg);
}

.fh-qp__qr {
  width: 150px;
  height: 150px;
  color: #b9c4d8;
  opacity: 0.9;
}

.fh-qp__corner {
  position: absolute;
  width: 34px;
  height: 34px;
  border: 3px solid var(--fh-gold);
}

.fh-qp__corner--tl {
  top: -3px;
  left: -3px;
  border-right: none;
  border-bottom: none;
  border-top-left-radius: var(--fh-radius-lg);
}

.fh-qp__corner--tr {
  top: -3px;
  right: -3px;
  border-left: none;
  border-bottom: none;
  border-top-right-radius: var(--fh-radius-lg);
}

.fh-qp__corner--bl {
  bottom: -3px;
  left: -3px;
  border-right: none;
  border-top: none;
  border-bottom-left-radius: var(--fh-radius-lg);
}

.fh-qp__corner--br {
  bottom: -3px;
  right: -3px;
  border-left: none;
  border-top: none;
  border-bottom-right-radius: var(--fh-radius-lg);
}

.fh-qp__beam {
  position: absolute;
  left: 24px;
  right: 24px;
  height: 3px;
  border-radius: 2px;
  background: linear-gradient(90deg, transparent, var(--fh-gold), transparent);
  box-shadow: 0 0 12px rgb(214 178 118 / 45%);
  animation: fh-qp-beam 2.4s ease-in-out infinite;
}

@keyframes fh-qp-beam {
  0%, 100% {
    top: 32px;
    opacity: 0.4;
  }
  50% {
    top: 266px;
    opacity: 1;
  }
}

.fh-qp__scan-info {
  max-width: 420px;
}

.fh-qp__scan-title {
  margin: 0 0 10px;
  font-size: 26px;
  font-weight: 700;
  color: var(--fh-text);
}

.fh-qp__scan-desc {
  margin: 0 0 26px;
  font-size: 16px;
  color: var(--fh-text-2);
}

.fh-qp__tips {
  background: var(--fh-surface);
  border: 1px solid var(--fh-line);
  border-radius: var(--fh-radius);
  padding: 22px 26px;
}

.fh-qp__tip {
  display: flex;
  align-items: center;
  font-size: 15px;
  color: var(--fh-text-2);
  margin-bottom: 14px;
}

.fh-qp__tip:last-child {
  margin-bottom: 0;
}

.fh-qp__tip-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--fh-gold);
  margin-right: 12px;
  flex: none;
}

/* ---- 证件号录入：左输入列 + 右软键盘 ---- */

.fh-qp__cert {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.fh-qp__cert-left {
  width: 560px;
  margin-right: 56px;
  display: flex;
  flex-direction: column;
}

.fh-qp__cert-tabs {
  display: flex;
  margin-bottom: 24px;
}

.fh-qp__cert-tab {
  flex: 1;
  height: 52px;
  border: 1px solid var(--fh-line-strong);
  background: var(--fh-surface);
  color: var(--fh-text-2);
  font-family: inherit;
  font-size: 17px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.fh-qp__cert-tab:first-child {
  border-radius: var(--fh-radius-sm) 0 0 var(--fh-radius-sm);
}

.fh-qp__cert-tab:last-child {
  border-radius: 0 var(--fh-radius-sm) var(--fh-radius-sm) 0;
  border-left: none;
}

.fh-qp__cert-tab.is-active {
  background: var(--fh-ink);
  border-color: var(--fh-ink);
  color: #fff;
}

.fh-qp__display {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 72px;
  padding: 0 12px 0 24px;
  background: var(--fh-surface);
  border: 2px solid var(--fh-line-strong);
  border-radius: var(--fh-radius);
  margin-bottom: 16px;
}

.fh-qp__display-text {
  font-size: 30px;
  letter-spacing: 2px;
  color: var(--fh-text);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
}

.fh-qp__display-text.is-empty {
  color: var(--fh-text-3);
  font-size: 18px;
  letter-spacing: 0;
}

.fh-qp__display-actions {
  display: flex;
  flex: none;
}

.fh-qp__mini-btn {
  height: 44px;
  padding: 0 20px;
  margin-left: 10px;
  border: 1px solid var(--fh-line-strong);
  border-radius: var(--fh-radius-sm);
  background: var(--fh-surface-2);
  color: var(--fh-text-2);
  font-family: inherit;
  font-size: 15px;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease;
}

.fh-qp__mini-btn:hover {
  border-color: var(--fh-ink);
  color: var(--fh-ink);
}

.fh-qp__mini-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.fh-qp__progress {
  width: 100%;
  display: flex;
  align-items: center;
  margin-bottom: 32px;
}

.fh-qp__progress-bar {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background: var(--fh-line);
  overflow: hidden;
}

.fh-qp__progress-fill {
  height: 100%;
  border-radius: 3px;
  background: var(--fh-ink);
  transition: width 0.2s ease, background 0.2s ease;
}

.fh-qp__progress-fill.is-full {
  background: var(--fh-gold);
}

.fh-qp__progress-text {
  width: 40px;
  text-align: right;
  font-size: 14px;
  color: var(--fh-text-2);
  font-variant-numeric: tabular-nums;
  margin-left: 12px;
  flex: none;
}

.fh-qp__confirm {
  width: 100%;
  height: 68px;
  font-size: 20px;
}
</style>
