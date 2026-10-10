<script setup lang="ts">
import type { InvoiceApply, PayBusiness } from '@/api/types/payment'
import PaymentApi from '@/api/payment'
import { httpContext } from '@/http/context'
import { useGlobalLoadingStore, useGlobalMessageStore } from '@/layouts/legacy-layout/store'

import { isEmpty } from '@/utils'

definePage({
  meta: {
    title: '发票清单',
  },
})

const route = useRoute()
const router = useRouter()
const { printReportPdf } = useReport()
const { playText } = useSpeech()
const globalLoadingStore = useGlobalLoadingStore()
const globalMessageStore = useGlobalMessageStore()

const invoices = ref<InvoiceApply[]>([])
const payBusiness = ref<PayBusiness | undefined>({})

const showPrintModal = ref(false)
const printingInvoice = ref<InvoiceApply | null>(null)
const countdown = ref(3)
const modalTimer = ref<ReturnType<typeof setInterval> | null>(null)

const processInvoiceIds = ref<string[]>([])
const autoPrintedInvoiceIds = ref<Set<string>>(new Set())

const processingCount = computed(() => {
  return invoices.value.filter(inv => ['1', '2'].includes(inv.payTaxInvoiceStatus || '')).length
})

const completedCount = computed(() => {
  return invoices.value.filter(inv => inv.payTaxInvoiceStatus === '3').length
})

function clearModalTimer() {
  if (modalTimer.value) {
    clearInterval(modalTimer.value)
    modalTimer.value = null
  }
}

function closeModal() {
  showPrintModal.value = false
  clearModalTimer()
  countdown.value = 3
}

function startAutoClose() {
  clearModalTimer()
  countdown.value = 3
  modalTimer.value = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) {
      closeModal()
    }
  }, 1000)
}

function getInvoiceStatus(status?: InvoiceApply['payTaxInvoiceStatus']) {
  const statusMap = {
    1: { text: '开票中', class: 'processing' },
    2: { text: '开票中', class: 'processing' },
    3: { text: '已开票', class: 'completed' },
    6: { text: '开票失败', class: 'failed' },
    9: { text: '开票失败', class: 'failed' },
  }
  return statusMap[status || '1'] || statusMap['1']
}

async function handlePrint(invoice: InvoiceApply) {
  printingInvoice.value = invoice

  playText('正在打印发票，请稍候')
  globalLoadingStore.showLoading()

  try {
    await printReportPdf({
      code: 'paymentInvoice',
      extParams: {
        invoiceCode: invoice.invoiceCode,
        invoiceId: invoice.id,
        invoiceNo: invoice.invoiceNo,
        // platform: invoice.platform,
        access_token: httpContext.getTokenValue(),
      },
    })

    playText('您的发票已打印完成，请从机器下方出口处取走')
    globalMessageStore.success({ message: '打印成功' })
    showPrintModal.value = true
    startAutoClose()
  }
  catch (error: any) {
    console.error(error)
    playText('抱歉，发票打印未能成功。请您稍后重试，若仍未解决，请及时联系工作人员为您处理。')
    globalMessageStore.error({ message: '打印失败' })
  }
  finally {
    globalLoadingStore.hideLoading()
  }
}

async function fetchInvoiceList() {
  const query = route.query
  const data = await PaymentApi.getInvoiceList({
    businessId: query.businessId as string,
    businessType: query.businessType as string,
  })
  invoices.value = data?.applyList || []
  payBusiness.value = data?.business

  // 需要自动处理的发票记录，开票成功触发打印
  if (!isEmpty(processInvoiceIds.value)) {
    for (const invoiceId of processInvoiceIds.value) {
      const invoice = invoices.value.find(iv => iv.id === invoiceId)
      if (invoice?.payTaxInvoiceStatus === '3') {
        if (autoPrintedInvoiceIds.value.has(invoiceId)) {
          continue
        }
        autoPrintedInvoiceIds.value.add(invoiceId)
        await handlePrint(invoice)
      }
    }
  }
}

const pollingTask = useTimeTask(async (next, stop) => {
  await fetchInvoiceList()
  if (processingCount.value === 0) {
    stop()
  }
  else {
    next()
  }
}, 3000, false)

onMounted(() => {
  // const query = route.query
  // const queryInvoiceIds = (query.invoiceIds || []) as string[]
  // processInvoiceIds.value = isEmpty(queryInvoiceIds) ? [] : queryInvoiceIds
  processInvoiceIds.value = []
  fetchInvoiceList().then(() => {
    nextTick(() => {
      if (!isEmpty(invoices.value) && processingCount.value > 0) {
        pollingTask?.start()
      }
    })
  })
})

onUnmounted(() => {
  clearModalTimer()
})
</script>

<template>
  <div class="page">
    <div class="container">
      <h2 class="title">
        发票详情
      </h2>

      <Transition name="status">
        <div v-if="processingCount > 0" class="status-banner warning">
          <div class="status-icon">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div class="status-content">
            <h3 class="status-title">
              您有 {{ processingCount }} 张发票正在开票中
            </h3>
            <p class="status-text">
              <!-- 系统正在自动处理，开票完成后将自动打印，请稍候... -->
              系统正在自动处理，请稍候...
            </p>
          </div>
        </div>
      </Transition>

      <Transition name="status">
        <div v-if="completedCount > 0 && processingCount === 0" class="status-banner success">
          <div class="status-icon">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" />
              <polyline points="8 12 12 16 20 8" />
            </svg>
          </div>
          <div class="status-content">
            <h3 class="status-title">
              发票开具成功
            </h3>
            <p class="status-text">
              您的 {{ completedCount }} 张发票已成功开具，感谢使用
            </p>
          </div>
        </div>
      </Transition>

      <div class="section">
        <h3 class="section-title">
          发票列表
        </h3>

        <div v-if="isEmpty(invoices)" class="empty">
          <div class="empty-icon">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
          </div>
          <h4 class="empty-title">
            暂无发票
          </h4>
          <p class="empty-text">
            您尚未开具任何发票，请返回首页进行其他操作
          </p>
        </div>

        <div v-else class="list">
          <div
            v-for="(invoice, index) in invoices"
            :key="invoice.id"
            class="card"
            :style="{ animationDelay: `${index * 0.1}s` }"
          >
            <div class="card-header">
              <h4 class="card-number">
                {{ invoice.invoiceCode || '' }}{{ invoice.invoiceNo || '开票中...' }}
              </h4>
              <div class="card-badge" :class="getInvoiceStatus(invoice.payTaxInvoiceStatus).class">
                {{ getInvoiceStatus(invoice.payTaxInvoiceStatus).text }}
              </div>
            </div>

            <div class="card-body">
              <div class="row">
                <span class="label">发票抬头</span>
                <span class="value">{{ invoice.title }}</span>
              </div>
              <div class="row">
                <span class="label">开票时间</span>
                <span class="value">{{ invoice.invoiceTime || invoice.payInvoiceTime }}</span>
              </div>
              <div class="row">
                <span class="label">开票金额</span>
                <span class="value amount">¥{{ invoice.factPrice?.toFixed(2) || '0.00' }}</span>
              </div>
            </div>

            <div v-if="invoice.payTaxInvoiceStatus === '2'" class="progress">
              <div class="progress-header">
                <span>开票进度</span>
                <span>正在生成...</span>
              </div>
              <div class="progress-bar">
                <div class="progress-fill" />
              </div>
            </div>

            <div class="card-actions">
              <button
                v-if="invoice.payTaxInvoiceStatus === '3'"
                class="btn primary"
                @click="handlePrint(invoice)"
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                打印发票
              </button>
              <button v-else class="btn disabled" disabled>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {{ getInvoiceStatus(invoice.payTaxInvoiceStatus).text }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="footer-actions">
        <button class="btn secondary" @click="router.push('/')">
          返回首页
        </button>
      </div>
    </div>

    <Transition name="modal">
      <div v-if="showPrintModal" class="overlay" @click.self="closeModal">
        <div class="modal">
          <div class="modal-icon success">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 class="modal-title">
            {{ '打印任务已发送' }}
          </h3>
          <p class="modal-text">
            请在打印机出口取走您的发票
          </p>
          <div class="modal-info">
            <span class="info-label">发票号码</span>
            <span class="info-value">{{ printingInvoice?.invoiceCode }}{{ printingInvoice?.invoiceNo }}</span>
          </div>
          <button class="btn primary" @click="closeModal">
            确定 ({{ countdown }}s)
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
$primary: #003594;
$primary-light: #0066cc;
$primary-bg: rgba(0, 53, 148, 0.08);
$success: #4caf50;
$success-dark: #2e7d32;
$success-bg: linear-gradient(135deg, #f0fff4, #e6fffa);
$warning: #d97706;
$warning-bg: linear-gradient(135deg, #fffbeb, #fef3c7);
$danger: #e53935;

$text-dark: #1a1a1a;
$text: #666;
$text-light: #8c8c8c;

$bg: #f8f9fa;
$card: #ffffff;
$input: #f8f9fa;
$border: #e0e0e0;

$radius-lg: 16px;
$radius-md: 12px;
$radius-sm: 8px;

$shadow: 0 4px 15px rgba(0, 0, 0, 0.15);
$shadow-card: 0 2px 8px rgba(0, 0, 0, 0.08);
$shadow-hover: 0 4px 15px rgba(0, 0, 0, 0.12);

@mixin flex-center {
  display: flex;
  align-items: center;
  justify-content: center;
}

@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes stripes {
  from { background-position: 40px 0; }
  to { background-position: 0 0; }
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.page {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: $bg;
  overflow-y: auto;
  padding: 0 30px 50px;
}

.container {
  max-width: 800px;
  width: 100%;
  margin: 30px auto;
  background: $card;
  border-radius: 15px;
  box-shadow: $shadow;
  padding: 40px;
}

.title {
  font-size: 28px;
  font-weight: 800;
  text-align: center;
  margin: 0 0 30px;
  background: linear-gradient(135deg, $primary 0%, $primary-light 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.status-banner {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 25px;
  border-radius: $radius-md;
  margin-bottom: 30px;

  &.success {
    background: $success-bg;
    border: 2px solid $success;

    .status-icon { svg { color: $success; } }
    .status-title { color: $success-dark; }
    .status-text { color: $success; }
  }

  &.warning {
    background: $warning-bg;
    border: 2px solid $warning;

    .status-icon { svg { color: $warning; } }
    .status-title { color: $warning; }
    .status-text { color: darken($warning, 10%); }
  }
}

.status-icon {
  @include flex-center;
  width: 80px;
  height: 80px;
  background: $card;
  border-radius: 50%;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
  flex-shrink: 0;

  svg {
    width: 48px;
    height: 48px;
    stroke-width: 3;
  }
}

.status-content { flex: 1; }
.status-title { font-size: 24px; font-weight: 700; margin: 0 0 8px; }
.status-text { font-size: 16px; margin: 0; line-height: 1.5; }

.section { margin-bottom: 30px; }

.section-title {
  font-size: 20px;
  font-weight: 700;
  color: $primary;
  margin: 0 0 20px;
  padding-bottom: 10px;
  border-bottom: 2px solid $border;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px 20px;
  background: $bg;
  border: 2px dashed $border;
  border-radius: $radius-md;
  text-align: center;
  gap: 20px;

  &-icon {
    color: $text-light;
    opacity: 0.7;
    animation: fadeIn 1s ease-out;

    svg {
      width: 64px;
      height: 64px;
    }
  }

  &-title {
    font-size: 24px;
    color: #616161;
    margin: 0;
    font-weight: 700;
    animation: fadeIn 0.8s ease-out 0.2s both;
  }

  &-text {
    font-size: 16px;
    color: #757575;
    margin: 0;
    line-height: 1.6;
    max-width: 400px;
    animation: fadeIn 0.8s ease-out 0.4s both;
  }
}

.list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.card {
  background: $bg;
  border: 1px solid $border;
  border-radius: $radius-md;
  padding: 20px;
  box-shadow: $shadow-card;
  transition: all 0.3s ease;
  animation: fadeInUp 0.4s ease-out forwards;

  &:hover {
    transform: translateY(-2px);
    box-shadow: $shadow-hover;
  }

  &-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 15px;
  }

  &-number {
    font-size: 18px;
    color: $primary;
    margin: 0;
    font-weight: 700;
  }

  &-badge {
    padding: 6px 12px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 600;

    &.completed {
      background: #e3f2fd;
      color: #1976d2;
    }

    &.processing {
      background: #fff3e0;
      color: #f57c00;
    }

    &.pending {
      background: #f5f5f5;
      color: #757575;
    }

    &.failed {
      background: #ffebee;
      color: #c62828;
    }

    &.auth {
      background: #fce4ec;
      color: #ad1457;
    }
  }

  &-body {
    margin-bottom: 20px;
  }

  &-actions {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
  }
}

.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);

  &:last-child { border-bottom: none; }

  &.highlight {
    background: $primary-bg;
    margin: 0 -12px;
    padding: 12px;
    border-radius: $radius-sm;
    border-bottom: none;
  }
}

.label {
  font-size: 14px;
  color: $text;
  font-weight: 500;
}

.value {
  font-size: 14px;
  color: $text-dark;
  font-weight: 600;
  text-align: right;

  &.amount {
    color: $danger;
    font-size: 18px;
    font-weight: 700;
  }
}

.progress {
  margin-bottom: 20px;
  padding: 12px;
  border-radius: $radius-sm;
  background: $input;

  &-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 8px;
    font-size: 14px;

    :first-child { font-weight: 500; color: $text; }
    :last-child { color: $text-light; }
  }

  &-bar {
    height: 8px;
    border-radius: 999px;
    background: $border;
    overflow: hidden;
  }

  &-fill {
    height: 100%;
    width: 65%;
    border-radius: 999px;
    background: linear-gradient(90deg, $warning, #f59e0b);
    background-image: linear-gradient(
      45deg,
      rgba(255, 255, 255, 0.15) 25%,
      transparent 25%,
      transparent 50%,
      rgba(255, 255, 255, 0.15) 50%,
      rgba(255, 255, 255, 0.15) 75%,
      transparent 75%,
      transparent
    );
    background-size: 40px 40px;
    animation: stripes 1s linear infinite;
  }
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px 35px;
  font-size: 16px;
  font-weight: 700;
  border: none;
  border-radius: 50px;
  cursor: pointer;
  transition: all 0.3s ease;
  min-width: 160px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);

  svg {
    width: 20px;
    height: 20px;
  }

  &.primary {
    background: linear-gradient(135deg, $primary, $primary-light);
    color: white;
    box-shadow: 0 5px 18px rgba(0, 53, 148, 0.3);

    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 25px rgba(0, 53, 148, 0.4);
    }
  }

  &.secondary {
    background: #f5f5f5;
    color: $text;
    border: 2px solid $border;

    &:hover {
      background: $border;
      transform: translateY(-1px);
      box-shadow: 0 5px 15px rgba(0, 0, 0, 0.15);
    }
  }

  &.disabled {
    background: $border;
    color: $text-light;
    cursor: not-allowed;
    box-shadow: none;
  }
}

.footer-actions {
  display: flex;
  gap: 15px;
  justify-content: center;
  margin-top: 40px;
}

.overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  @include flex-center;
  padding: 24px;
}

.modal {
  background: $card;
  border-radius: $radius-lg;
  width: 100%;
  max-width: 400px;
  padding: 32px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  text-align: center;
  position: relative;
  z-index: 101;

  &-icon {
    @include flex-center;
    width: 64px;
    height: 64px;
    margin: 0 auto 20px;
    border-radius: $radius-md;

    &.success {
      background: rgba($success, 0.1);

      svg {
        width: 32px;
        height: 32px;
        color: $success;
      }
    }
  }

  &-title {
    font-size: 20px;
    font-weight: 700;
    margin-bottom: 8px;
    color: $text-dark;
  }

  &-text {
    font-size: 16px;
    color: $text-light;
    margin-bottom: 20px;
  }

  &-info {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 16px;
    border-radius: $radius-md;
    background: $bg;
    margin-bottom: 24px;

    .info-label {
      font-size: 14px;
      color: $text-light;
      margin-bottom: 4px;
    }

    .info-value {
      font-family: monospace;
      font-size: 18px;
      font-weight: 600;
      color: $text-dark;
    }
  }
}

.status-enter-active,
.status-leave-active { transition: all 0.3s ease; }
.status-enter-from,
.status-leave-to { opacity: 0; transform: translateY(-10px); }

.modal-enter-active,
.modal-leave-active { transition: all 0.25s ease; }
.modal-enter-from,
.modal-leave-to { opacity: 0; }
.modal-enter-from .modal,
.modal-leave-to .modal { transform: scale(0.95) translateY(10px); }

@media (max-width: 768px) {
  .container {
    padding: 30px 20px;
    margin: 20px;
  }

  .status-banner {
    flex-direction: column;
    text-align: center;
  }

  .card-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }

  .card-actions {
    justify-content: center;
  }

  .footer-actions {
    flex-direction: column;
    align-items: center;
  }

  .btn {
    width: 100%;
    max-width: 300px;
  }
}

@media (max-width: 480px) {
  .row {
    flex-direction: column;
    align-items: flex-start;
    gap: 5px;
    text-align: left;
  }

  .value { text-align: left; }

  .card-actions {
    flex-direction: column;
  }

  .btn { width: 100%; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
