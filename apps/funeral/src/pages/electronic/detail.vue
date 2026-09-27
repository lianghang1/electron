<script setup lang="ts">
import type { GetCertificateResponse } from '../../types/funeral'
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { fh } from '../../api/fh'
import FhModal from '../../components/FhModal.vue'
import { playSpeech } from '../../composables/use-speech'

/**
 * 电子证照详情：加载证照 PDF（base64 → data URL 内联预览），支持在线打印。
 */
const route = useRoute()

const loading = ref(true)
const errorFlag = ref(false)
const pdfBase64 = ref('')
const certInfo = ref<GetCertificateResponse | undefined>()
const printing = ref(false)
const printInfo = ref({ businessId: '', reportCode: '' })

const modalVisible = ref(false)
const modalType = ref<'success' | 'error' | 'warning'>('success')
const modalMessage = ref('')

const pdfUrl = computed(() => (pdfBase64.value ? `data:application/pdf;base64,${pdfBase64.value}#toolbar=0&navpanes=0` : ''))

/** 证照类型文案：5 火化证 / 其他寄存证 */
const certTypeLabel = computed(() => (route.query.businessType === '5' ? '火化证' : '寄存证明'))

/** 签发日期展示（截去可能携带的时间部分） */
const issueDateText = computed(() => certInfo.value?.issueDate ? certInfo.value.issueDate.slice(0, 10) : '—')

function showModal(type: 'success' | 'error' | 'warning', message: string): void {
  modalType.value = type
  modalMessage.value = message
  modalVisible.value = true
}

async function handleGetOrder(): Promise<void> {
  errorFlag.value = false
  loading.value = true
  try {
    const query = route.query
    const bizId = query.businessId as string
    // 5 火化证 / 其他寄存证
    const type = query.businessType === '5' ? '02' : '03'
    const cert = await fh.getCertificateInfo({ bizId, type })
    certInfo.value = cert

    if (cert.status !== '3') {
      showModal('warning', '未查询到该证照信息')
      errorFlag.value = true
      return
    }

    const reportCode = query.businessType === '5' ? 'commonCremationCertificate' : 'commonAshesStorageCertificate'
    printInfo.value = { businessId: bizId, reportCode }
    pdfBase64.value = await fh.downloadReport({ code: reportCode, extParams: { businessId: bizId } })
  }
  finally {
    loading.value = false
  }
}

async function handlePrint(): Promise<void> {
  if (printing.value)
    return
  printing.value = true
  try {
    void playSpeech('正在打印证照，请稍候')
    await fh.printReport({ code: printInfo.value.reportCode, extParams: { businessId: printInfo.value.businessId } })
    void playSpeech('您的证照已打印完成，请从机器下方出口处取走')
    showModal('success', '打印任务已发送，请在打印机出口取走您的证照')
  }
  catch {
    void playSpeech('抱歉，证照打印未能成功。请您稍后重试，若仍未解决，请及时联系工作人员为您处理。')
    showModal('error', '打印失败，请稍后重试')
  }
  finally {
    printing.value = false
  }
}

onMounted(handleGetOrder)
</script>

<template>
  <div class="fh-page">
    <div class="fh-page-content fe-cert">
      <header class="fe-cert__header">
        <div>
          <h3 class="fe-cert__title">
            电子证照
          </h3>
          <p class="fe-cert__sub">
            在线查看和打印您的证照文件
          </p>
        </div>
        <button
          v-if="pdfUrl && !errorFlag"
          class="fh-btn fh-btn--primary fe-cert__print"
          :disabled="printing"
          @click="handlePrint"
        >
          {{ printing ? '正在打印...' : '打印证照' }}
        </button>
      </header>

      <!-- 加载中 -->
      <div v-if="loading" class="fe-cert__state">
        <div class="fe-cert__spinner" />
        <p>正在加载证照...</p>
      </div>

      <!-- 加载失败 -->
      <div v-else-if="errorFlag" class="fe-cert__state">
        <div class="fe-cert__state-icon fe-cert__state-icon--warn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M12 7v6" />
            <circle cx="12" cy="16.8" r="0.4" fill="currentColor" />
          </svg>
        </div>
        <h4>证照加载失败</h4>
        <p>未查询到该证照信息，请稍后重试</p>
        <button class="fh-btn fh-btn--ghost fe-cert__retry" @click="handleGetOrder">
          重新加载
        </button>
      </div>

      <!-- 证照信息 + PDF 预览 -->
      <div v-else-if="pdfUrl" class="fe-cert__body">
        <div class="fe-cert__meta">
          <div class="fe-cert__meta-item">
            <span class="fe-cert__meta-label">证照类型</span>
            <span class="fe-cert__meta-value">{{ certTypeLabel }}</span>
          </div>
          <span class="fe-cert__meta-divider" />
          <div class="fe-cert__meta-item">
            <span class="fe-cert__meta-label">证照编号</span>
            <span class="fe-cert__meta-value fe-cert__meta-value--num">{{ certInfo?.certificateNo || '—' }}</span>
          </div>
          <span class="fe-cert__meta-divider" />
          <div class="fe-cert__meta-item">
            <span class="fe-cert__meta-label">签发日期</span>
            <span class="fe-cert__meta-value fe-cert__meta-value--num">{{ issueDateText }}</span>
          </div>
        </div>
        <div class="fe-cert__viewer">
          <iframe :src="pdfUrl" class="fe-cert__pdf" />
        </div>
      </div>
    </div>

    <FhModal
      v-model:visible="modalVisible"
      :type="modalType"
      :message="modalMessage"
      confirm-text="知道了"
      :duration="3000"
    />
  </div>
</template>

<style scoped>
.fe-cert {
  display: flex;
  flex-direction: column;
  padding: 24px 32px;
}

.fe-cert__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--fh-line);
  flex: none;
}

.fe-cert__title {
  margin: 0;
  font-family: var(--fh-font-serif);
  font-size: 21px;
  font-weight: 700;
  letter-spacing: 1px;
  color: var(--fh-text);
}

.fe-cert__sub {
  margin: 4px 0 0;
  font-size: 14px;
  color: var(--fh-text-3);
}

.fe-cert__print {
  height: 48px;
  padding: 0 36px;
  font-size: 16px;
}

/* ---- 状态区 ---- */

.fe-cert__state {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.fe-cert__spinner {
  width: 48px;
  height: 48px;
  border: 3px solid var(--fh-line);
  border-top-color: var(--fh-gold);
  border-radius: 50%;
  animation: fe-cert-spin 1s linear infinite;
}

@keyframes fe-cert-spin {
  to {
    transform: rotate(360deg);
  }
}

.fe-cert__state p {
  margin: 18px 0 0;
  font-size: 16px;
  color: var(--fh-text-2);
}

.fe-cert__state h4 {
  margin: 18px 0 0;
  font-size: 20px;
  color: var(--fh-text);
}

.fe-cert__state-icon {
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}

.fe-cert__state-icon svg {
  width: 30px;
  height: 30px;
}

.fe-cert__state-icon--warn {
  background: var(--fh-warn-soft);
  color: var(--fh-warn);
}

.fe-cert__retry {
  height: 46px;
  margin-top: 24px;
  padding: 0 36px;
}

/* ---- 证照信息条 + PDF 预览 ---- */

.fe-cert__body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.fe-cert__meta {
  flex: none;
  display: flex;
  align-items: center;
  margin-top: 16px;
  padding: 12px 22px;
  background: var(--fh-surface-2);
  border-left: 3px solid var(--fh-gold);
  border-radius: 0 var(--fh-radius-sm) var(--fh-radius-sm) 0;
}

.fe-cert__meta-item {
  display: flex;
  flex-direction: column;
}

.fe-cert__meta-label {
  font-size: 12px;
  letter-spacing: 1px;
  color: var(--fh-text-3);
  margin-bottom: 2px;
}

.fe-cert__meta-value {
  font-family: var(--fh-font-serif);
  font-size: 17px;
  font-weight: 600;
  color: var(--fh-text);
}

.fe-cert__meta-value--num {
  font-variant-numeric: tabular-nums;
}

.fe-cert__meta-divider {
  width: 1px;
  height: 30px;
  background: var(--fh-line-strong);
  margin: 0 28px;
}

.fe-cert__viewer {
  flex: 1;
  min-height: 0;
  margin-top: 12px;
  border: 1px solid var(--fh-line);
  border-radius: var(--fh-radius);
  overflow: hidden;
  background: var(--fh-surface);
  box-shadow: var(--fh-shadow-card);
}

.fe-cert__pdf {
  width: 100%;
  height: 100%;
  border: none;
  display: block;
}
</style>
