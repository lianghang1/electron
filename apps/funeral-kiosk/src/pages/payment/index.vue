<script setup lang="ts">
import BusienssApi from '@/api/business'
import AppModal from '@/components/common/AppModal/index.vue'
import { isEmpty } from '@/utils'

definePage({
  meta: {
    title: '业务缴费',
  },
})

const router = useRouter()
const { playText } = useSpeech()

const activeTab = ref<'scan' | 'idcard'>('scan')
const idCard = ref('')
const loading = ref(false)
const inputFocused = ref(false)

// 证件类型：idcard-身份证(15/18位), other-其他证件
const certType = ref<'idcard' | 'other'>('idcard')

// 弹窗提示
const modalVisible = ref(false)
const modalType = ref<'info' | 'success' | 'error' | 'warning'>('info')
const modalMessage = ref('')

function showModal(type: typeof modalType.value, message: string) {
  modalType.value = type
  modalMessage.value = message
  modalVisible.value = true
}

const tipText = ref('请将业务单二维码朝下，置于屏幕下方的扫码区，听到"滴"声即完成扫描。')

// 格式化证件号显示（添加空格）- 仅身份证格式化
const formattedIdCard = computed(() => {
  const val = idCard.value
  if (certType.value !== 'idcard')
    return val
  if (val.length <= 6)
    return val
  if (val.length <= 14)
    return `${val.slice(0, 6)} ${val.slice(6)}`
  return `${val.slice(0, 6)} ${val.slice(6, 14)} ${val.slice(14)}`
})

// 输入进度
const inputProgress = computed(() => {
  if (certType.value === 'idcard') {
    // 身份证：目标15位或18位
    const targetLength = idCard.value.length <= 15 ? 15 : 18
    return Math.min((idCard.value.length / targetLength) * 100, 100)
  }
  // 其他证件：最少3位
  const minLength = 3
  const currentLength = idCard.value.length
  if (currentLength < minLength)
    return (currentLength / minLength) * 100
  return 100
})

// 输入提示文本
const inputPlaceholder = computed(() => {
  if (certType.value === 'idcard')
    return '请输入逝者身份证号码'
  return '请输入逝者证件号码'
})

// 进度文本 - 只显示当前输入位数
const progressText = computed(() => {
  return `${idCard.value.length}位`
})

// 是否有输入内容
const hasInput = computed(() => idCard.value.length > 0)

// 是否可以查询
const canQuery = computed(() => {
  if (certType.value === 'idcard') {
    // 身份证：15位或18位
    return idCard.value.length === 15 || idCard.value.length === 18
  }
  // 其他证件：至少3位
  return idCard.value.length >= 3
})

// 是否完成输入（用于样式）
const isComplete = computed(() => {
  if (certType.value === 'idcard') {
    return idCard.value.length === 15 || idCard.value.length === 18
  }
  return idCard.value.length >= 3
})

function handleTabChange(tab: 'scan' | 'idcard') {
  activeTab.value = tab
  idCard.value = ''
  certType.value = 'idcard'
  if (tab === 'scan') {
    playText(tipText.value)
  }
  else {
    playText('请输入逝者身份证号码查询待缴费业务')
  }
}

function handleCertTypeChange(type: 'idcard' | 'other') {
  certType.value = type
  idCard.value = ''
  if (type === 'idcard') {
    playText('请输入逝者身份证号码')
  }
  else {
    playText('请输入逝者证件号码')
  }
}

async function handleQuery() {
  if (!idCard.value.trim()) {
    showModal('error', certType.value === 'idcard' ? '请输入逝者身份证号码' : '请输入逝者证件号码')
    return
  }

  if (certType.value === 'idcard') {
    // 身份证验证
    const idCardRegex = /^\d{15}$|^\d{17}[\dX]$/i
    if (!idCardRegex.test(idCard.value.trim())) {
      showModal('error', '请输入正确的逝者身份证号码（15位或18位）')
      return
    }
  }
  else {
    // 其他证件验证
    if (idCard.value.trim().length < 3) {
      showModal('error', '请输入至少3位字符的证件号码')
      return
    }
  }

  loading.value = true
  try {
    const data = await BusienssApi.getBusinessIdByDeadCert({ value: idCard.value.trim() })
    if (isEmpty(data)) {
      showModal('info', '未查询到待缴费业务')
      playText('未查询到待缴费业务，请检查证件号码是否正确')
      return
    }
    router.push({
      path: '/payment/order-detail',
      query: {
        businessId: data,
        businessType: '5',
      },
    })
  }
  finally {
    loading.value = false
  }
}

function handleKeyInput(key: string) {
  if (key === 'backspace') {
    idCard.value = idCard.value.slice(0, -1)
  }
  else if (key === 'clear') {
    idCard.value = ''
  }
  else {
    if (certType.value === 'idcard') {
      // 身份证限制长度
      const maxLength = idCard.value.length < 15 ? 15 : 18
      if (idCard.value.length < maxLength) {
        idCard.value += key
      }
    }
    else {
      // 其他证件限制最大20位，防止超出输入框
      if (idCard.value.length < 20) {
        idCard.value += key
      }
    }
  }
}

onMounted(() => {
  playText(tipText.value)
})
</script>

<template>
  <div class="feature-page">
    <div class="page-content">
      <!-- 选项卡 -->
      <div class="tab-container">
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'scan' }"
          @click="handleTabChange('scan')"
        >
          <span class="tab-icon scan-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M9 21V9" />
            </svg>
          </span>
          <div class="tab-info">
            <span class="tab-title">扫码查询</span>
            <span class="tab-desc">扫描业务单二维码</span>
          </div>
        </button>
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'idcard' }"
          @click="handleTabChange('idcard')"
        >
          <span class="tab-icon idcard-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <circle cx="9" cy="10" r="2" />
              <path d="M15 8h2M15 12h2M6 16h12" />
            </svg>
          </span>
          <div class="tab-info">
            <span class="tab-title">证件查询</span>
            <span class="tab-desc">输入逝者证件号码</span>
          </div>
        </button>
      </div>

      <!-- 扫码区域 -->
      <div v-show="activeTab === 'scan'" class="content-area">
        <div class="scan-card">
          <div class="scan-visual">
            <div class="scan-frame">
              <div class="scan-animation">
                <img src="@/assets/scan.gif" class="scan-image">
              </div>
              <div class="scan-corners">
                <span class="corner corner-tl" />
                <span class="corner corner-tr" />
                <span class="corner corner-bl" />
                <span class="corner corner-br" />
              </div>
            </div>
          </div>
          <div class="scan-info">
            <h3 class="scan-title">
              请将业务单二维码朝下
            </h3>
            <p class="scan-desc">
              置于屏幕下方的扫码区，听到"滴"声即完成扫描
            </p>
            <div class="scan-tips">
              <div class="tip-item">
                <span class="tip-dot" />
                <span>办理前，请备好您的业务单</span>
              </div>
              <div class="tip-item">
                <span class="tip-dot" />
                <span>请勿将手指或非业务单物品放入扫描区</span>
              </div>
              <div class="tip-item">
                <span class="tip-dot" />
                <span>如需帮助，请咨询工作人员</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 证件查询区域 -->
      <div v-show="activeTab === 'idcard'" class="content-area">
        <div class="idcard-card">
          <!-- 证件类型切换 -->
          <div class="cert-type-tabs">
            <button
              class="cert-type-btn"
              :class="{ active: certType === 'idcard' }"
              @click="handleCertTypeChange('idcard')"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <circle cx="9" cy="10" r="2" />
                <path d="M15 8h2M15 12h2M6 16h12" />
              </svg>
              <span>身份证</span>
            </button>
            <button
              class="cert-type-btn"
              :class="{ active: certType === 'other' }"
              @click="handleCertTypeChange('other')"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M8 12h8M12 8v8" />
              </svg>
              <span>其他证件</span>
            </button>
          </div>

          <!-- 输入展示区域 -->
          <div class="input-display-card">
            <div class="input-header">
              <div class="input-badge">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <circle cx="9" cy="10" r="2" />
                  <path d="M15 8h2M15 12h2M6 16h12" />
                </svg>
                <span>{{ certType === 'idcard' ? '身份证查询' : '证件查询' }}</span>
              </div>
              <div class="input-progress">
                <div class="progress-bar">
                  <div class="progress-fill" :style="{ width: `${inputProgress}%` }" />
                </div>
                <span class="progress-text">{{ progressText }}</span>
              </div>
            </div>

            <div class="idcard-display">
              <div class="display-box" :class="{ focused: inputFocused, complete: isComplete }">
                <template v-if="formattedIdCard">
                  <span class="display-text">{{ formattedIdCard }}</span>
                  <span v-if="certType === 'other' || (certType === 'idcard' && idCard.length < 18 && idCard.length !== 15)" class="cursor" />
                </template>
                <template v-else>
                  <span class="display-placeholder">{{ inputPlaceholder }}</span>
                </template>
              </div>
            </div>

            <div class="input-actions">
              <button
                class="action-btn clear"
                :disabled="!hasInput"
                @click="handleKeyInput('clear')"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                <span>清空</span>
              </button>
              <button
                class="action-btn backspace"
                :disabled="!hasInput"
                @click="handleKeyInput('backspace')"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
                  <line x1="18" y1="9" x2="12" y2="15" />
                  <line x1="12" y1="9" x2="18" y2="15" />
                </svg>
                <span>退格</span>
              </button>
            </div>

            <!-- 确认查询按钮 -->
            <button
              class="query-submit-btn"
              :class="{ active: canQuery, loading }"
              :disabled="!canQuery || loading"
              @click="handleQuery"
            >
              <span v-if="loading" class="btn-spinner" />
              <span v-else class="btn-text">确认查询</span>
            </button>
          </div>

          <!-- 虚拟键盘 -->
          <div class="keyboard-card">
            <div class="keyboard-grid">
              <button
                v-for="num in ['1', '2', '3', '4', '5', '6', '7', '8', '9']"
                :key="num"
                class="key num-key"
                @click="handleKeyInput(num)"
              >
                {{ num }}
              </button>
              <button class="key empty-key" disabled />
              <button class="key num-key" @click="handleKeyInput('0')">
                0
              </button>
              <button class="key x-key" @click="handleKeyInput('X')">
                X
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 弹窗提示 -->
    <AppModal
      v-model:visible="modalVisible"
      :type="modalType"
      :message="modalMessage"
      confirm-text="知道了"
      :duration="0"
    />
  </div>
</template>

<style lang="scss" scoped>
.feature-page {
  padding-top: 50px;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
}

.page-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* 选项卡 */
.tab-container {
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 26px;
  padding: 24px 57px;
  border: 2px solid #e2e8f0;
  background: white;
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  color: #475569;

  &:hover {
    transform: translateY(-2px);
    border-color: var(--v-color-primary);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  }

  &.active {
    border-color: var(--v-color-primary);
    background: rgba(0, 53, 148, 0.05);
    color: var(--v-color-primary);
    box-shadow: 0 4px 16px rgba(0, 53, 148, 0.15);

    .tab-icon {
      background: rgba(0, 53, 148, 0.1);
    }

    .tab-desc {
      color: var(--v-color-primary);
    }
  }
}

.tab-icon {
  width: 68px;
  height: 68px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f1f5f9;
  border-radius: 12px;
  transition: all 0.3s ease;

  svg {
    width: 24px;
    height: 24px;
  }

  &.scan-icon {
    color: #059669;
  }

  &.idcard-icon {
    color: var(--v-color-primary);
  }
}

.tab-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: left;
}

.tab-title {
  font-size: 24px;
  font-weight: 600;
}

.tab-desc {
  font-size: 16px;
  color: #64748b;
  transition: color 0.3s ease;
}

/* 内容区域 */
.content-area {
  margin-top: 40px;
  width: 100%;
  max-width: 1200px;
  display: flex;
  justify-content: center;
}

/* 扫码区域 */
.scan-card {
  display: flex;
  gap: 40px;
  background: white;
  border-radius: 24px;
  padding: 90px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  align-items: center;
  min-height: 560px;
}

.scan-visual {
  flex-shrink: 0;
}

.scan-frame {
  position: relative;
  width: 280px;
  height: 280px;
  padding: 12px;
}

.scan-animation {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%);
  border-radius: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.scan-image {
  width: 200px;
  height: 200px;
  object-fit: contain;
}

.scan-corners {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.corner {
  position: absolute;
  width: 32px;
  height: 32px;
  border-color: #059669;
  border-style: solid;
  border-width: 0;

  &.corner-tl {
    top: 0;
    left: 0;
    border-top-width: 4px;
    border-left-width: 4px;
    border-radius: 12px 0 0 0;
  }

  &.corner-tr {
    top: 0;
    right: 0;
    border-top-width: 4px;
    border-right-width: 4px;
    border-radius: 0 12px 0 0;
  }

  &.corner-bl {
    bottom: 0;
    left: 0;
    border-bottom-width: 4px;
    border-left-width: 4px;
    border-radius: 0 0 0 12px;
  }

  &.corner-br {
    bottom: 0;
    right: 0;
    border-bottom-width: 4px;
    border-right-width: 4px;
    border-radius: 0 0 12px 0;
  }
}

.scan-info {
  flex: 1;
  max-width: 400px;
}

.scan-title {
  font-size: 32px;
  font-weight: 700;
  color: #1e293b;
  margin: 0 0 8px 0;
}

.scan-desc {
  font-size: 19px;
  color: #64748b;
  margin: 0 0 24px 0;
  line-height: 1.6;
}

.scan-tips {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tip-item {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  color: #475569;
}

.tip-dot {
  width: 6px;
  height: 6px;
  background: #059669;
  border-radius: 50%;
  flex-shrink: 0;
}

/* 证件查询卡片 */
.idcard-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: white;
  border-radius: 24px;
  padding: 32px 40px 40px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  min-height: 620px;
  max-width: 680px;
  width: 100%;
}

/* 证件类型切换 */
.cert-type-tabs {
  display: flex;
  gap: 12px;
  background: #f1f5f9;
  padding: 12px;
  border-radius: 12px;
}

.cert-type-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 16px;
  border: none;
  background: transparent;
  border-radius: 8px;
  font-size: 20px;
  font-weight: 500;
  color: #64748b;
  cursor: pointer;
  transition: all 0.3s ease;

  svg {
    width: 32px;
    height: 32px;
  }

  &:hover {
    background: rgba(255, 255, 255, 0.5);
  }

  &.active {
    background: white;
    color: var(--v-color-primary);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }
}

/* 输入展示卡片 */
.input-display-card {
  background: white;
  border-radius: 20px;
  padding: 24px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
}

.input-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.input-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 18px;
  background: var(--v-color-primary-linear-gradient);
  color: white;
  border-radius: 20px;
  font-size: 18px;
  font-weight: 500;

  svg {
    width: 26px;
    height: 26px;
  }
}

.input-progress {
  display: flex;
  align-items: center;
  gap: 10px;
}

.progress-bar {
  width: 140px;
  height: 8px;
  background: #e2e8f0;
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--v-color-primary-linear-gradient);
  border-radius: 3px;
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 16px;
  font-weight: 600;
  color: var(--v-color-primary);
  min-width: 50px;
  text-align: right;
}

.idcard-display {
  margin-bottom: 16px;
}

.display-box {
  position: relative;
  height: 64px;
  padding: 16px 20px;
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  border: 2px solid #e2e8f0;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;

  &.focused {
    border-color: var(--v-color-primary);
    box-shadow: 0 0 0 4px rgba(0, 53, 148, 0.1);
  }

  &.complete {
    border-color: #059669;
    background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%);
  }
}

.display-text {
  font-size: 22px;
  font-weight: 600;
  color: #1e293b;
  letter-spacing: 2px;
  font-family: 'SF Mono', monospace;
  line-height: 1;
}

.display-placeholder {
  font-size: 22px;
  color: #94a3b8;
  line-height: 1;
}

.cursor {
  width: 2px;
  height: 24px;
  background: var(--v-color-primary);
  margin-left: 4px;
  animation: blink 1s infinite;
}

@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

.input-actions {
  display: flex;
  gap: 12px;
}

.action-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;

  svg {
    width: 24px;
    height: 24px;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &.clear {
    background: #f1f5f9;
    color: #64748b;

    &:hover:not(:disabled) {
      background: #e2e8f0;
    }
  }

  &.backspace {
    background: #fff1f2;
    color: #e11d48;

    &:hover:not(:disabled) {
      background: #ffe4e6;
    }
  }
}

/* 确认查询按钮 */
.query-submit-btn {
  width: 100%;
  height: 62px;
  margin-top: 16px;
  border: none;
  border-radius: 12px;
  background: #e2e8f0;
  color: #94a3b8;
  font-size: 20px;
  font-weight: 600;
  cursor: not-allowed;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;

  &.active {
    background: var(--v-color-primary-linear-gradient);
    color: white;
    cursor: pointer;
    box-shadow: 0 4px 16px rgba(0, 53, 148, 0.3);

    &:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 6px 20px rgba(0, 53, 148, 0.4);
    }
  }

  &.loading {
    cursor: wait;
  }

  .btn-text {
    font-size: 20px;
    font-weight: 600;
  }

  .btn-spinner {
    width: 20px;
    height: 20px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* 键盘卡片 */
.keyboard-card {
  background: white;
  border-radius: 20px;
  padding: 20px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
}

.keyboard-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.key {
  height: 66px;
  border: none;
  border-radius: 12px;
  font-size: 26px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;

  &:active {
    transform: scale(0.95);
  }

  &:disabled {
    cursor: default;
  }
}

.num-key {
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  color: #1e293b;
  border: 1px solid #e2e8f0;

  &:hover {
    background: linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%);
    border-color: #cbd5e1;
  }

  &:active {
    background: linear-gradient(135deg, #cbd5e1 0%, #94a3b8 100%);
  }
}

.x-key {
  background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
  color: #92400e;
  border: 1px solid #fcd34d;

  &:hover {
    background: linear-gradient(135deg, #fde68a 0%, #fcd34d 100%);
  }

  &:active {
    background: linear-gradient(135deg, #fcd34d 0%, #fbbf24 100%);
  }
}

.empty-key {
  background: transparent;
  cursor: default;
}

/* 响应式 */
@media (max-width: 1024px) {
  .idcard-card {
    padding: 24px 30px 30px;
    min-height: 480px;
  }
}

@media (max-width: 768px) {
  .page-content {
    padding: 16px;
  }

  .tab-container {
    flex-direction: column;
    width: 100%;
    gap: 12px;
  }

  .tab-btn {
    width: 100%;
    justify-content: flex-start;
  }

  .scan-card {
    flex-direction: column;
    padding: 24px;
  }

  .scan-frame {
    width: 220px;
    height: 220px;
  }

  .scan-image {
    width: 160px;
    height: 160px;
  }
}
</style>
