<script setup lang="ts">
import type { InvoiceApply, PayBusiness } from '../../types/funeral'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fh } from '../../api/fh'
import FhModal from '../../components/FhModal.vue'
import { playSpeech } from '../../composables/use-speech'

/**
 * 发票清单：展示该业务单全部发票，开票中自动轮询，已开票可打印。
 */
const route = useRoute()
const router = useRouter()

const invoices = ref<InvoiceApply[]>([])
const payBusiness = ref<PayBusiness | undefined>()
const printing = ref(false)

const modalVisible = ref(false)
const modalType = ref<'success' | 'error'>('success')
const modalMessage = ref('')
const modalDuration = ref(0)

let pollTimer: ReturnType<typeof setInterval> | null = null

const processingCount = computed(() => {
  return invoices.value.filter(inv => inv.payTaxInvoiceStatus === '1' || inv.payTaxInvoiceStatus === '2').length
})

const completedCount = computed(() => {
  return invoices.value.filter(inv => inv.payTaxInvoiceStatus === '3').length
})

function getInvoiceStatus(status?: InvoiceApply['payTaxInvoiceStatus']): { text: string, cls: string } {
  if (status === '3')
    return { text: '已开票', cls: 'completed' }
  if (status === '6' || status === '9')
    return { text: '开票失败', cls: 'failed' }
  return { text: '开票中', cls: 'processing' }
}

function showModal(type: 'success' | 'error', message: string, duration = 0): void {
  modalType.value = type
  modalMessage.value = message
  modalDuration.value = duration
  modalVisible.value = true
}

async function fetchInvoiceList(): Promise<void> {
  const query = route.query
  const data = await fh.getInvoiceList({
    businessId: query.businessId as string,
    businessType: query.businessType as string,
  })
  invoices.value = data.applyList || []
  payBusiness.value = data.business
}

async function handlePrint(invoice: InvoiceApply): Promise<void> {
  if (printing.value)
    return
  printing.value = true
  try {
    void playSpeech('正在打印发票，请稍候')
    await fh.printReport({
      code: 'paymentInvoice',
      extParams: {
        invoiceCode: invoice.invoiceCode || '',
        invoiceId: invoice.id,
        invoiceNo: invoice.invoiceNo || '',
      },
    })
    void playSpeech('您的发票已打印完成，请从机器下方出口处取走')
    showModal(
      'success',
      `打印任务已发送，请在打印机出口取走您的发票（发票号码 ${invoice.invoiceCode || ''}${invoice.invoiceNo || ''}）`,
      3000,
    )
  }
  catch {
    void playSpeech('抱歉，发票打印未能成功。请您稍后重试，若仍未解决，请及时联系工作人员为您处理。')
    showModal('error', '打印失败，请稍后重试')
  }
  finally {
    printing.value = false
  }
}

function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

onMounted(async () => {
  await fetchInvoiceList()
  if (processingCount.value > 0) {
    pollTimer = setInterval(async () => {
      try {
        await fetchInvoiceList()
        if (processingCount.value === 0)
          stopPolling()
      }
      catch {
        // 网络抖动继续轮询
      }
    }, 3000)
  }
})

onBeforeUnmount(stopPolling)
</script>

<template>
  <div class="fh-page">
    <div class="fh-page-content fi-list">
      <header class="fi-list__header">
        <div class="fi-list__title-wrap">
          <h3 class="fi-list__title">
            发票清单
          </h3>
          <p v-if="payBusiness?.businessNo" class="fi-list__sub">
            业务编号：{{ payBusiness.businessNo }}<template v-if="payBusiness?.userName">
              ｜逝者：{{ payBusiness.userName }}
            </template>
          </p>
        </div>
        <button class="fh-btn fh-btn--ghost fi-list__home" @click="router.push('/')">
          返回首页
        </button>
      </header>

      <!-- 开票中横幅 -->
      <div v-if="processingCount > 0" class="fi-list__banner fi-list__banner--warn">
        <span class="fi-list__banner-dot" />
        <span>您有 <b>{{ processingCount }}</b> 张发票正在开票中，系统正在自动处理，请稍候...</span>
      </div>
      <div v-else-if="completedCount > 0" class="fi-list__banner fi-list__banner--success">
        <span class="fi-list__banner-dot" />
        <span>您的 <b>{{ completedCount }}</b> 张发票已成功开具，感谢使用</span>
      </div>

      <!-- 发票列表 -->
      <main class="fi-list__main">
        <div v-if="!invoices.length" class="fi-list__empty">
          <p class="fi-list__empty-title">
            暂无发票
          </p>
          <p class="fi-list__empty-text">
            您尚未开具任何发票，请返回首页进行其他操作
          </p>
        </div>

        <div v-for="invoice in invoices" :key="invoice.id" class="fi-list__card">
          <div class="fi-list__card-head">
            <span class="fi-list__card-no">{{ invoice.invoiceCode || '' }}{{ invoice.invoiceNo || '开票中...' }}</span>
            <span class="fi-list__badge" :class="`fi-list__badge--${getInvoiceStatus(invoice.payTaxInvoiceStatus).cls}`">
              {{ getInvoiceStatus(invoice.payTaxInvoiceStatus).text }}
            </span>
          </div>
          <div class="fi-list__card-body">
            <div class="fi-list__row">
              <span class="fi-list__label">发票抬头</span>
              <span class="fi-list__value">{{ invoice.title }}</span>
            </div>
            <div class="fi-list__row">
              <span class="fi-list__label">开票时间</span>
              <span class="fi-list__value">{{ invoice.invoiceTime || invoice.payInvoiceTime }}</span>
            </div>
            <div class="fi-list__row">
              <span class="fi-list__label">开票金额</span>
              <span class="fi-list__value fi-list__value--amount">¥{{ invoice.factPrice?.toFixed(2) || '0.00' }}</span>
            </div>
          </div>
          <div class="fi-list__card-actions">
            <button
              v-if="invoice.payTaxInvoiceStatus === '3'"
              class="fh-btn fh-btn--primary fi-list__print"
              :disabled="printing"
              @click="handlePrint(invoice)"
            >
              打印发票
            </button>
            <button v-else class="fh-btn fh-btn--ghost fi-list__print" disabled>
              {{ getInvoiceStatus(invoice.payTaxInvoiceStatus).text }}
            </button>
          </div>
        </div>
      </main>
    </div>

    <FhModal
      v-model:visible="modalVisible"
      :type="modalType"
      :message="modalMessage"
      :duration="modalDuration"
    />
  </div>
</template>

<style scoped>
.fi-list {
  display: flex;
  flex-direction: column;
  padding: 24px 32px;
}

/* ---- 头部 ---- */

.fi-list__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: none;
}

.fi-list__title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--fh-text);
}

.fi-list__sub {
  margin: 4px 0 0;
  font-size: 14px;
  color: var(--fh-text-3);
}

.fi-list__home {
  height: 44px;
  padding: 0 28px;
}

/* ---- 状态横幅 ---- */

.fi-list__banner {
  display: flex;
  align-items: center;
  border-radius: var(--fh-radius-sm);
  padding: 12px 18px;
  margin-top: 16px;
  font-size: 15px;
  flex: none;
}

.fi-list__banner b {
  font-size: 17px;
  margin: 0 2px;
}

.fi-list__banner--warn {
  background: var(--fh-warn-soft);
  color: var(--fh-warn);
}

.fi-list__banner--success {
  background: var(--fh-success-soft);
  color: var(--fh-success);
}

.fi-list__banner-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  margin-right: 12px;
  flex: none;
}

/* ---- 列表 ---- */

.fi-list__main {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  margin-top: 18px;
  padding-right: 4px;
}

.fi-list__empty {
  padding: 64px 0;
  text-align: center;
}

.fi-list__empty-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--fh-text-2);
}

.fi-list__empty-text {
  margin: 10px 0 0;
  font-size: 15px;
  color: var(--fh-text-3);
}

.fi-list__card {
  background: var(--fh-surface-2);
  border: 1px solid var(--fh-line);
  border-radius: var(--fh-radius);
  padding: 18px 22px;
  margin-bottom: 16px;
}

.fi-list__card:last-child {
  margin-bottom: 0;
}

.fi-list__card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--fh-line);
}

.fi-list__card-no {
  font-size: 16px;
  font-weight: 700;
  color: var(--fh-ink);
}

.fi-list__badge {
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
}

.fi-list__badge--completed {
  background: var(--fh-success-soft);
  color: var(--fh-success);
}

.fi-list__badge--processing {
  background: var(--fh-warn-soft);
  color: var(--fh-warn);
}

.fi-list__badge--failed {
  background: var(--fh-danger-soft);
  color: var(--fh-danger);
}

.fi-list__card-body {
  padding: 6px 0;
}

.fi-list__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
}

.fi-list__label {
  font-size: 14px;
  color: var(--fh-text-2);
}

.fi-list__value {
  font-size: 15px;
  font-weight: 600;
  color: var(--fh-text);
}

.fi-list__value--amount {
  font-size: 19px;
  color: var(--fh-gold);
  font-variant-numeric: tabular-nums;
}

.fi-list__card-actions {
  display: flex;
  justify-content: flex-end;
  padding-top: 6px;
}

.fi-list__print {
  height: 44px;
  padding: 0 32px;
}
</style>
