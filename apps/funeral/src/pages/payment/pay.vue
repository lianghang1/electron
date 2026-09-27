<script setup lang="ts">
import type { SettlementMethod } from '../../types/funeral'
import QRCode from 'qrcode'
import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fh } from '../../api/fh'
import { fhResetCountdownKey } from '../../composables/use-countdown'
import { playSpeech } from '../../composables/use-speech'

/**
 * 扫码支付：展示二维码并 3s 轮询支付状态；
 * 成功后打印凭条，声明电子发票时转入发票清单页。
 */
const route = useRoute()
const router = useRouter()
const resetCountdown = inject(fhResetCountdownKey)

const serialNo = computed(() => (route.query.serialNo as string) || '')

const amount = ref(0)
const qrDataUrl = ref('')
const status = ref<'processing' | 'success' | 'fail'>('processing')
const methodName = ref('')
const paymentMethods = ref<SettlementMethod[]>([])
const hasElectronicInvoice = ref(false)
const printBillLock = ref(false)
const redirectCountdown = ref(10)

let pollTimer: ReturnType<typeof setInterval> | null = null
let redirectTimer: ReturnType<typeof setInterval> | null = null

function goHome(): void {
  router.push('/')
}

async function handlePrintBill(paymentGroupId: string): Promise<void> {
  if (printBillLock.value)
    return
  try {
    printBillLock.value = true
    void playSpeech('支付成功。感谢您的配合')
    await fh.printReport({ code: 'PaymentFinishBean', extParams: { groupId: paymentGroupId } })
  }
  finally {
    setTimeout(() => {
      printBillLock.value = false
    }, 1000)
  }
}

/** 拉取支付单状态；返回是否已完成（成功且已处理打印/跳转） */
async function handleGetOrder(): Promise<boolean> {
  const data = await fh.getPayOrder(serialNo.value)

  // 支付单过期：直接回首页
  const expireSecond = Math.floor((new Date(data.expiredTime.replace(/-/g, '/')).getTime() - Date.now()) / 1000)
  if (expireSecond < 1) {
    goHome()
    return false
  }
  resetCountdown?.(expireSecond)

  amount.value = data.amount
  if (!qrDataUrl.value && data.qrUrl)
    qrDataUrl.value = await QRCode.toDataURL(data.qrUrl)

  if (data.channelCode === 'unionpay')
    methodName.value = '微信/支付宝'
  else
    methodName.value = paymentMethods.value.find(m => m.methodCode === data.wayCode)?.methodName || ''

  if (['0', '1'].includes(data.payStatus))
    status.value = 'processing'
  else if (data.payStatus === '2' && data.paymentGroupId)
    status.value = 'success'
  else if (data.payStatus === '2')
    status.value = 'processing'
  else
    status.value = 'fail'

  if (status.value === 'success' && data.paymentGroupId) {
    hasElectronicInvoice.value = data.hasElectronicInvoice === true
    void handlePrintBill(data.paymentGroupId)
    if (hasElectronicInvoice.value) {
      const invoiceIds = data.invoices?.map(iv => iv.invoiceId) || []
      router.replace({
        path: '/invoice/order-detail',
        query: {
          invoiceIds,
          businessId: route.query.businessId as string,
          businessType: route.query.businessType as string,
        },
      })
    }
    return true
  }
  return false
}

function startRedirect(): void {
  redirectTimer = setInterval(() => {
    redirectCountdown.value--
    if (redirectCountdown.value <= 0) {
      stopRedirect()
      goHome()
    }
  }, 1000)
}

function stopRedirect(): void {
  if (redirectTimer) {
    clearInterval(redirectTimer)
    redirectTimer = null
  }
}

async function handleCancel(): Promise<void> {
  await fh.closePayOrder(serialNo.value)
  goHome()
}

onMounted(async () => {
  try {
    paymentMethods.value = await fh.getSettlementMethods()
  }
  catch {
    // 支付方式名兜底显示渠道文案
  }

  try {
    const done = await handleGetOrder()
    if (done) {
      startRedirect()
    }
    else {
      pollTimer = setInterval(async () => {
        try {
          const finished = await handleGetOrder()
          if (finished) {
            stopPolling()
            startRedirect()
          }
        }
        catch {
          // 网络抖动继续轮询
        }
      }, 3000)
    }
  }
  catch {
    // 支付单查询失败（不存在/已关闭）：展示失败态
    status.value = 'fail'
  }

  if (amount.value > 0)
    void playSpeech(`请扫码支付${amount.value}元`)
})

function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

onBeforeUnmount(() => {
  stopPolling()
  stopRedirect()
})
</script>

<template>
  <div class="fh-page">
    <div class="fh-page-content fp-pay">
      <!-- 等待扫码 -->
      <template v-if="status === 'processing'">
        <div class="fp-pay__amount">
          ¥{{ amount.toFixed(2) }}
        </div>
        <div class="fp-pay__method">
          {{ methodName ? `请使用「${methodName}」扫码支付` : '请使用微信/支付宝扫码支付' }}
        </div>
        <div class="fp-pay__qr">
          <img v-if="qrDataUrl" :src="qrDataUrl" alt="支付二维码">
        </div>
        <p class="fp-pay__tip">
          请打开手机客户端「扫一扫」，对准上方二维码完成支付
        </p>
        <button class="fh-btn fh-btn--ghost fp-pay__cancel" @click="handleCancel">
          取消支付
        </button>
      </template>

      <!-- 支付成功 -->
      <template v-else-if="status === 'success'">
        <div class="fp-pay__icon fp-pay__icon--success">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 class="fp-pay__title">
          支付成功
        </h3>
        <p class="fp-pay__amount fp-pay__amount--result">
          ¥{{ amount.toFixed(2) }}
        </p>
        <p class="fp-pay__desc">
          支付凭条正在打印，请从机器下方出口取走
        </p>
        <p class="fp-pay__redirect">
          {{ redirectCountdown }} 秒后自动返回首页
        </p>
      </template>

      <!-- 支付失败 -->
      <template v-else>
        <div class="fp-pay__icon fp-pay__icon--fail">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
            <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
          </svg>
        </div>
        <h3 class="fp-pay__title">
          支付未完成
        </h3>
        <p v-if="amount > 0" class="fp-pay__amount fp-pay__amount--result">
          订单金额 ¥{{ amount.toFixed(2) }}
        </p>
        <p class="fp-pay__desc">
          支付遇到问题，请联系工作人员处理
        </p>
        <button class="fh-btn fh-btn--primary fp-pay__home" @click="goHome">
          返回首页
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.fp-pay {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
}

.fp-pay__amount {
  font-size: 46px;
  font-weight: 700;
  color: var(--fh-gold);
  font-variant-numeric: tabular-nums;
}

.fp-pay__method {
  font-size: 16px;
  color: var(--fh-text-2);
  margin-top: 8px;
}

.fp-pay__qr {
  width: 280px;
  height: 280px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  border: 1px solid var(--fh-line);
  border-radius: var(--fh-radius-lg);
  padding: 18px;
  margin-top: 24px;
}

.fp-pay__qr img {
  width: 100%;
  height: 100%;
  display: block;
}

.fp-pay__tip {
  margin: 20px 0 0;
  font-size: 15px;
  color: var(--fh-text-2);
}

.fp-pay__cancel {
  height: 46px;
  margin-top: 26px;
  padding: 0 44px;
}

.fp-pay__icon {
  width: 96px;
  height: 96px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}

.fp-pay__icon svg {
  width: 48px;
  height: 48px;
}

.fp-pay__icon--success {
  background: var(--fh-success-soft);
  color: var(--fh-success);
}

.fp-pay__icon--fail {
  background: var(--fh-danger-soft);
  color: var(--fh-danger);
}

.fp-pay__title {
  margin: 24px 0 0;
  font-size: 30px;
  font-weight: 700;
  color: var(--fh-text);
}

.fp-pay__amount--result {
  margin: 14px 0 0;
  font-family: var(--fh-font-serif);
  font-size: 36px;
  font-weight: 700;
  color: var(--fh-gold);
  font-variant-numeric: tabular-nums;
}

.fp-pay__desc {
  margin: 12px 0 0;
  font-size: 17px;
  color: var(--fh-text-2);
}

.fp-pay__redirect {
  margin: 26px 0 0;
  font-size: 15px;
  color: var(--fh-text-3);
  font-variant-numeric: tabular-nums;
}

.fp-pay__home {
  height: 46px;
  margin-top: 26px;
  padding: 0 44px;
}
</style>
