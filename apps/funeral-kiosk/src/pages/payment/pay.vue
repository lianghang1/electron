<script setup lang="ts">
import type { SettlementMethod } from '@/api/types/payment'
import dayjs from 'dayjs'
import VueQr from 'vue-qr'
import PaymentApi from '@/api/payment'
import { isBooleanTrue, isEmpty } from '@/utils'

definePage({
  meta: {
    title: '扫描二维码支付',
  },
})

const router = useRouter()
const route = useRoute()
const { resetCountdown } = useAppContext()
const { printReportPdf } = useReport()
const { playText } = useSpeech()

const paymentMethodName = ref<string>()
const amount = ref<number>(0)
const paymentStatus = ref<'processing' | 'success' | 'fail'>('processing')
const qrUrl = ref<string>('')
const paymentMethods = ref<SettlementMethod[]>([])
const expiredTime = ref<string>('')
const loading = ref<boolean>(false)
const hasElectronicInvoice = ref<boolean>(false)
const printBillLock = ref<boolean>(false)

const serialNo = computed<string>(() => {
  return (route.query?.serialNo || '') as string
})

const redirectCountdown = ref(10)

async function handleCancelPayment() {
  if (loading.value) {
    return
  }
  loading.value = true
  try {
    await PaymentApi.closePayOrder(serialNo.value)
    goHome()
  }
  finally {
    loading.value = false
  }
}

async function handlePrintBill(paymentGroupId: string) {
  if (printBillLock.value) {
    return
  }
  try {
    printBillLock.value = true
    playText(`支付成功。感谢您的配合`)
    await printReportPdf({
      code: 'PaymentFinishBean',
      extParams: {
        groupId: paymentGroupId,
      },
    })
  }
  finally {
    setTimeout(() => {
      printBillLock.value = false
    }, 1000)
  }
}

function diffSecond(date1: string, date2: string | Date) {
  return dayjs(date1).diff(dayjs(date2), 'second')
}

async function handleGetPayOrder(loading = false) {
  const data = await PaymentApi.getPayOrder(serialNo.value, {
    meta: {
      $loading: loading,
    },
  })
  expiredTime.value = data!.expiredTime
  qrUrl.value = data!.qrUrl
  if (data!.channelCode === 'unionpay') {
    paymentMethodName.value = '微信/支付宝'
  }
  else {
    paymentMethodName.value = paymentMethods.value.find(e => e.methodCode === data?.wayCode)?.methodName
  }
  const expireSecond = diffSecond(data!.expiredTime, new Date())
  if (expireSecond < 1) {
    goHome()
    return
  }
  resetCountdown(expireSecond)
  amount.value = data!.amount

  if (['0', '1'].includes(data!.payStatus)) {
    paymentStatus.value = 'processing'
  }
  else if (data!.payStatus === '2') {
    if (data!.paymentGroupId) {
      paymentStatus.value = 'success'
    }
    else {
      paymentStatus.value = 'processing'
    }
  }
  else {
    paymentStatus.value = 'fail'
  }

  const isSuccess = paymentStatus.value === 'success'
  if (isSuccess && data?.paymentGroupId) {
    hasElectronicInvoice.value = isBooleanTrue(data.hasElectronicInvoice)
    handlePrintBill(data.paymentGroupId).finally(() => {
      if (hasElectronicInvoice.value) {
        const invoiceIds = data.invoices?.map(iv => iv.invoiceId) || []
        const query = route.query
        router.replace({
          path: '/invoice/order-detail',
          query: {
            invoiceIds,
            businessId: query.businessId as string,
            businessType: query.businessType as string,
          },
        })
      }
    })
  }
  // 如果没有结算ID和发票明细的情况下返回false
  if (isEmpty(data?.paymentGroupId) || isEmpty(data?.invoices)) {
    return false
  }
  return isSuccess
}

const redirectTask = useTimeTask((next, stop) => {
  redirectCountdown.value--
  if (redirectCountdown.value <= 0) {
    stop()
    goHome()
    return
  }
  next()
}, 1000)

const pollingTask = useTimeTask(async (next, stop) => {
  try {
    const result = await handleGetPayOrder()
    if (result) {
      stop()
      redirectTask?.start()
      return
    }
    next()
  }
  catch (e) {
    console.error(e)
    next()
  }
}, 3000, false)

onMounted(async () => {
  const data = await PaymentApi.getSettlementMethods()
  paymentMethods.value = data!
  const payResult = await handleGetPayOrder(true)
  if (payResult) {
    pollingTask?.stop()
    redirectTask?.start()
  }
  else {
    pollingTask?.start()
  }
  if (amount.value > 0) {
    playText('请扫描二维码支付')
  }
})

function goHome() {
  if (hasElectronicInvoice.value) {
    return
  }
  router.replace('/')
}
</script>

<template>
  <div class="feature-page payment-qr-page">
    <div class="page-content">
      <div class="payment-qr-container">
        <template v-if="paymentStatus === 'processing'">
          <div class="payment-qr-header">
            <h3 class="payment-qr-title">
              请扫描二维码支付
            </h3>
            <p class="payment-qr-amount">
              金额：{{ amount }} 元
            </p>
          </div>
          <div class="payment-qr-code">
            <div class="qr-placeholder">
              <div v-if="qrUrl">
                <VueQr :text="qrUrl" :margin="0" />
              </div>
              <div class="text-hex-000000 font-600">
                <div>{{ paymentMethodName }}</div>
                <div>过期时间：{{ expiredTime }}</div>
              </div>
            </div>
          </div>
          <div class="payment-qr-info">
            <p>请使用{{ paymentMethodName }}扫描上方二维码</p>
          </div>
          <div class="payment-qr-actions">
            <button class="btn btn-secondary" @click="handleCancelPayment">
              取消支付
            </button>
          </div>
        </template>

        <template v-else>
          <div class="payment-result" :class="paymentStatus">
            <div class="payment-result-icon">
              <svg v-if="paymentStatus === 'success'" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="16 12 10 18 8 16" />
              </svg>
              <svg v-else width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <div class="payment-result-content">
              <h3 class="payment-result-title">
                {{ paymentStatus === 'success' ? '支付成功' : '支付失败' }}
              </h3>
              <p class="payment-result-message">
                {{ paymentStatus === 'success' ? '您的支付已完成，感谢使用' : '支付失败，请检查网络或重新尝试' }}
              </p>

              <div v-if="paymentStatus === 'success'" class="printing-notice">
                <div class="printing-icon">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="6 9 6 2 18 2 18 9" />
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                    <rect x="6" y="14" width="12" height="8" />
                  </svg>
                </div>
                <p class="printing-text">
                  正在打印缴费凭证，请稍候...
                </p>
              </div>

              <div class="payment-result-actions">
                <button class="btn btn-secondary" @click="goHome">
                  返回首页
                </button>
              </div>
              <div v-if="paymentStatus === 'success'" class="auto-redirect">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <span>系统将在 <span class="redirect-timer">{{ redirectCountdown }}</span> 秒后自动返回首页</span>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 页面整体布局 */
.feature-page {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

/* 主要内容区域 */
.page-content {
  flex: 1;
  overflow-y: auto;
  padding: 0 30px 50px;
  margin-right: -30px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

/* 支付二维码容器 */
.payment-qr-container {
  background: white;
  border-radius: 16px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.15);
  padding: 40px;
  text-align: center;
  max-width: 500px;
  width: 100%;
  position: relative;
}

/* 支付二维码头部 */
.payment-qr-header {
  margin-bottom: 30px;
}

/* 增强支付成功的样式 */
.payment-result.success {
  background: linear-gradient(135deg, #f0fff4, #e6fffa);
  border: 3px solid #4caf50;
  border-radius: 16px;
  padding: 50px 40px;
  box-shadow: 0 12px 40px rgba(76, 175, 80, 0.2);
  animation: successPulse 1.5s ease-in-out;
}

@keyframes successPulse {
  0% { transform: scale(0.95); opacity: 0.7; }
  50% { transform: scale(1.05); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}

.payment-result.success .payment-result-title {
  color: #2e7d32;
  font-size: 32px;
  margin-bottom: 20px;
}

.payment-result.success .payment-result-message {
  color: #43a047;
  font-size: 19px;
  margin-bottom: 40px;
  line-height: 1.8;
}

/* 成功图标容器增强 */
.payment-result.success .payment-result-icon {
  width: 120px;
  height: 120px;
  margin-bottom: 30px;
}

/* 成功图标光晕效果 */
.payment-result.success .payment-result-icon::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 120px;
  height: 120px;
  background: rgba(76, 175, 80, 0.2);
  border-radius: 50%;
  animation: successRing 2s ease-in-out;
  z-index: 0;
}

@keyframes successRing {
  0% {
    transform: translate(-50%, -50%) scale(0.8);
    opacity: 1;
  }
  100% {
    transform: translate(-50%, -50%) scale(2);
    opacity: 0;
  }
}

/* 自动跳转提示 */
.auto-redirect {
  margin-top: 20px;
  color: #666;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  justify-content: center;
}

.redirect-timer {
  color: #4caf50;
  font-weight: 700;
  font-size: 16px;
}

/* 增强支付成功图标 */
.payment-result.success .payment-result-icon svg {
  color: #4caf50;
  stroke-width: 4;
  width: 100px;
  height: 100px;
  position: relative;
  z-index: 1;
  animation: successIcon 1s ease-out;
}

@keyframes successIcon {
  0% { transform: scale(0) rotate(0deg); }
  50% { transform: scale(1.2) rotate(180deg); }
  100% { transform: scale(1) rotate(360deg); }
}

.payment-qr-title {
  color: #333;
  font-size: 24px;
  font-weight: 700;
  margin: 0 0 10px 0;
}

.payment-qr-amount {
  color: #e53935;
  font-size: 20px;
  font-weight: 700;
  margin: 0;
}

/* 二维码区域 */
.payment-qr-code {
  background: white;
  padding: 20px;
  border-radius: 12px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
  margin-bottom: 30px;
  border: 2px solid #f0f0f0;
}

.qr-placeholder {
  width: 300px;
  height: 300px;
  background: #fafafa;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 20px;
  margin: 0 auto;
  position: relative;
  overflow: hidden;
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 支付信息 */
.payment-qr-info {
  color: #666;
  font-size: 16px;
  line-height: 1.6;
}

.payment-qr-info p {
  margin: 8px 0;
}

/* 支付结果样式 */
.payment-result {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 50px 40px;
  text-align: center;
}

.payment-result.success {
  border: 3px solid #4caf50;
  border-radius: 12px;
  padding: 40px;
}

.payment-result.failed {
  border: 3px solid #f44336;
  border-radius: 12px;
  padding: 40px;
}

.payment-result-icon {
  margin-bottom: 30px;
  position: relative; /* 添加相对定位，确保伪元素正确定位 */
  display: flex;
  justify-content: center;
  align-items: center;
  width: 120px;
  height: 120px;
}

.payment-result-icon svg {
  stroke-width: 3;
  width: 80px;
  height: 80px;
  position: relative;
  z-index: 1;
}

.payment-result.success .payment-result-icon svg {
  color: #4caf50;
}

.payment-result.failed .payment-result-icon svg {
  color: #f44336;
}

.payment-result-title {
  color: #333;
  font-size: 28px;
  font-weight: 800;
  margin: 0 0 15px 0;
}

.payment-result-message {
  color: #666;
  font-size: 18px;
  line-height: 1.6;
  margin: 0 0 40px 0;
  max-width: 400px;
}

/* 按钮样式 */
.payment-result-actions {
  display: flex;
  gap: 20px;
  justify-content: center;
  flex-wrap: wrap;
}

.btn {
  padding: 18px 45px;
  border-radius: 50px;
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.3s ease;
  border: none;
  outline: none;
  min-width: 160px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
}

.btn-secondary {
  background: #f5f5f5;
  color: #666;
  border: 2px solid #e0e0e0;
  transition: all 0.3s ease;
}

.btn-secondary:hover {
  background: #e0e0e0;
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
}

.btn-primary {
  background: linear-gradient(135deg, #e53935, #c62828);
  color: white;
  font-size: 20px;
  padding: 20px 60px;
  min-width: 200px;
  box-shadow: 0 6px 25px rgba(229, 57, 53, 0.3);
  position: relative;
  overflow: hidden;
}

.btn-primary::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
  transition: left 0.5s ease;
}

.btn-primary:hover {
  transform: translateY(-3px);
  box-shadow: 0 10px 35px rgba(229, 57, 53, 0.4);
}

.btn-primary:hover::before {
  left: 100%;
}

.btn-primary:active {
  transform: translateY(-1px);
  box-shadow: 0 6px 25px rgba(229, 57, 53, 0.3);
}

/* 取消支付按钮 */
.payment-qr-actions {
  margin-top: 30px;
  display: flex;
  justify-content: center;
}

.payment-qr-actions .btn {
  min-width: 180px;
}

/* 打印提示样式 */
.printing-notice {
  margin: 15px 0 10px 0;
  padding: 20px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 12px;
  box-shadow: 0 3px 15px rgba(0, 0, 0, 0.1);
  border: 1px solid rgba(76, 175, 80, 0.2);
  width: 100%;
  max-width: 320px;
  margin-left: auto;
  margin-right: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  animation: fadeIn 0.5s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}

.printing-icon {
  color: #4caf50;
  animation: printPulse 1.5s ease-in-out infinite;
}

@keyframes printPulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.05); opacity: 0.8; }
}

.printing-text {
  color: #43a047;
  font-size: 16px;
  font-weight: 600;
  text-align: center;
  margin: 0;
  line-height: 1.5;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .payment-qr-container {
    padding: 30px 20px;
    margin: 20px;
  }

  .qr-placeholder {
    width: 250px;
    height: 250px;
  }

  .payment-result-actions {
    flex-direction: column;
    align-items: center;
  }

  .btn {
    width: 100%;
    max-width: 300px;
  }
}
</style>
