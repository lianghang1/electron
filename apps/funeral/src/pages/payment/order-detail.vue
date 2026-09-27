<script setup lang="ts">
import type { PayBillItem, PayBusiness, PayInvoiceInit, SettlementMethod } from '../../types/funeral'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fh } from '../../api/fh'
import FhModal from '../../components/FhModal.vue'
import { playSpeech } from '../../composables/use-speech'

/**
 * 结算单详情：分组展示收费项目，提交结算后进入扫码支付。
 */
const route = useRoute()
const router = useRouter()

const payBillItems = ref<PayBillItem[]>([])
const payMethods = ref<SettlementMethod[]>([])
const payBusiness = ref<PayBusiness | undefined>()
const settlementInvoice = ref<PayInvoiceInit | undefined>()
const finalAmount = ref(0)
const totalAmount = ref(0)
const discountAmount = ref(0)
const machineId = ref('')
const paymentLoading = ref(false)

const modalVisible = ref(false)
const modalMessage = ref('')

/** 分位安全的金额累加（避免浮点误差，不引第三方库） */
function add(a: number, b: number): number {
  return Math.round((a + b) * 100) / 100
}

interface ChargeCategory {
  type: string
  label: string
  color: string
  items: PayBillItem[]
  totalShould: number
  totalDiscount: number
}

const CATEGORY_DEFS: Record<string, { label: string, color: string }> = {
  1: { label: '行政性收费', color: 'var(--fh-ink)' },
  2: { label: '服务型收费', color: 'var(--fh-success)' },
  3: { label: '经营性收费', color: 'var(--fh-warn)' },
  other: { label: '其他', color: 'var(--fh-text-3)' },
}

const chargeCategories = computed<ChargeCategory[]>(() => {
  const map = new Map<string, ChargeCategory>()
  for (const item of payBillItems.value) {
    const type = item.groupId && CATEGORY_DEFS[item.groupId] ? item.groupId : 'other'
    if (!map.has(type)) {
      map.set(type, { type, ...CATEGORY_DEFS[type], items: [], totalShould: 0, totalDiscount: 0 })
    }
    const category = map.get(type)!
    category.items.push(item)
    category.totalShould = add(category.totalShould, item.shouldPrice || 0)
    category.totalDiscount = add(category.totalDiscount, item.discountPrice || 0)
  }
  return [...map.values()]
})

async function handleCancelLastPayment(): Promise<void> {
  if (!payBillItems.value.length)
    return
  // 结算前关闭遗留待支付单，避免重复支付
  const settlementItems = payBillItems.value.map(item => ({
    billItemId: item.billItemId,
    orderId: item.orderId,
    orderType: item.orderType,
    orderItemId: item.orderItemId,
    paymentPrice: item.shouldPrice,
    billVersion: item.billVersion,
  }))
  const pending = await fh.getPendingPaymentOrders(settlementItems)
  const first = pending[0]
  if (first && ['0', '1'].includes(first.payStatus))
    await fh.closePayOrder(first.serialNo)
}

async function handleGetOrder(): Promise<void> {
  const query = route.query
  const data = await fh.settlementInit({
    businessId: query.businessId as string,
    businessType: query.businessType as string,
  })

  settlementInvoice.value = data.invoiceInit
  payBusiness.value = data.business
  payBillItems.value = data.billItems || []
  payMethods.value = (data.settlementMethods || []).filter(item => item.methodName && item.methodCode)

  let shouldPrice = 0
  let sumPrice = 0
  let discountPrice = 0
  for (const item of payBillItems.value) {
    shouldPrice = add(shouldPrice, item.shouldPrice || 0)
    sumPrice = add(sumPrice, item.sumPrice || 0)
    discountPrice = add(discountPrice, item.discountPrice || 0)
  }
  finalAmount.value = shouldPrice
  totalAmount.value = sumPrice
  discountAmount.value = discountPrice

  if (finalAmount.value > 0)
    void playSpeech(`当前有待缴费项目，应付金额为${finalAmount.value}元，请按提示完成支付。`)
  else
    void playSpeech('当前无待缴费项目。如需帮助，请向工作人员咨询。')

  void handleCancelLastPayment()
}

async function handlePayment(): Promise<void> {
  if (paymentLoading.value)
    return
  const query = route.query
  const method = payMethods.value[0]
  try {
    paymentLoading.value = true
    const response = await fh.settlement({
      counterId: machineId.value,
      businessId: query.businessId as string,
      businessType: query.businessType as string,
      payItems: payBillItems.value.map(item => ({
        billItemId: item.billItemId,
        orderId: item.orderId,
        orderType: item.orderType,
        orderItemId: item.orderItemId,
        paymentPrice: item.shouldPrice,
        billVersion: item.billVersion,
      })),
      settlementMethods: [
        {
          methodCode: method?.extendData?.code || method?.methodCode || '',
          paymentPrice: finalAmount.value,
        },
      ],
      invoiceType: '2',
      settlementInvoice: settlementInvoice.value,
    })

    if (!response.thirdPartyPay) {
      modalMessage.value = '当前支付方式暂不可用，请联系工作人员'
      modalVisible.value = true
      return
    }
    router.replace({
      path: '/payment/pay',
      query: {
        serialNo: response.payResponse.serialNo,
        businessId: query.businessId as string,
        businessType: query.businessType as string,
      },
    })
  }
  finally {
    paymentLoading.value = false
  }
}

onMounted(async () => {
  try {
    machineId.value = (await fh.getConfig()).machineId
  }
  catch {
    // 配置不可用不影响结算流程
  }
  handleGetOrder()
})
</script>

<template>
  <div class="fh-page">
    <div class="fh-page-content fp-order">
      <!-- 业务信息 + 金额汇总 -->
      <header class="fp-order__header">
        <div class="fp-order__info">
          <div class="fp-order__info-item">
            <span class="fp-order__info-label">逝者姓名</span>
            <span class="fp-order__info-value">{{ payBusiness?.userName || '-' }}</span>
          </div>
          <span class="fp-order__divider" />
          <div class="fp-order__info-item">
            <span class="fp-order__info-label">经办人姓名</span>
            <span class="fp-order__info-value">{{ payBusiness?.linkman || '-' }}</span>
          </div>
          <span class="fp-order__divider" />
          <div class="fp-order__info-item">
            <span class="fp-order__info-label">业务编号</span>
            <span class="fp-order__info-value fp-order__info-value--highlight">{{ payBusiness?.businessNo || '-' }}</span>
          </div>
        </div>
        <div class="fp-order__amounts">
          <div class="fp-order__amount-item">
            <span class="fp-order__amount-label">总金额</span>
            <span class="fp-order__amount-value">¥{{ totalAmount.toFixed(2) }}</span>
          </div>
          <div v-if="discountAmount > 0" class="fp-order__amount-item">
            <span class="fp-order__amount-label">优惠</span>
            <span class="fp-order__amount-value fp-order__amount-value--discount">-¥{{ discountAmount.toFixed(2) }}</span>
          </div>
        </div>
      </header>

      <!-- 收费项目分组列表 -->
      <main class="fp-order__main">
        <h3 class="fp-order__section-title">
          <span class="fp-order__title-bar" />
          收费项目
          <span class="fp-order__section-count">共 {{ payBillItems.length }} 项</span>
        </h3>

        <div v-for="category in chargeCategories" :key="category.type" class="fp-order__group">
          <div class="fp-order__group-header" :style="{ borderLeftColor: category.color }">
            <span class="fp-order__group-name" :style="{ color: category.color }">{{ category.label }}</span>
            <span class="fp-order__group-count">{{ category.items.length }}项</span>
            <span v-if="category.totalDiscount > 0" class="fp-order__group-discount">已优惠 ¥{{ category.totalDiscount.toFixed(2) }}</span>
            <span class="fp-order__group-total">¥{{ category.totalShould.toFixed(2) }}</span>
          </div>
          <div v-for="(item, idx) in category.items" :key="idx" class="fp-order__item" :class="{ 'is-even': idx % 2 === 1 }">
            <div class="fp-order__item-left">
              <span class="fp-order__item-name">{{ item.itemName }}</span>
              <span class="fp-order__item-spec">¥{{ item.price }} × {{ item.qty }}</span>
            </div>
            <div class="fp-order__item-right">
              <span v-if="item.discountPrice && item.discountPrice > 0" class="fp-order__item-discount">优惠 ¥{{ item.discountPrice }}</span>
              <span class="fp-order__item-amount">¥{{ item.shouldPrice }}</span>
            </div>
          </div>
        </div>

        <div v-if="!payBillItems.length" class="fp-order__empty">
          暂无收费项目
        </div>
      </main>

      <!-- 底部操作栏 -->
      <footer class="fp-order__footer">
        <div class="fp-order__pay-amount">
          <span class="fp-order__pay-label">应付金额</span>
          <span class="fp-order__pay-value">¥{{ finalAmount.toFixed(2) }}</span>
        </div>
        <p class="fp-order__tips">
          支付完成后可在扫码开票中申请电子发票
        </p>
        <button
          class="fh-btn fh-btn--primary fp-order__submit"
          :disabled="paymentLoading || finalAmount <= 0"
          @click="handlePayment"
        >
          {{ paymentLoading ? '正在创建支付...' : '立即支付' }}
        </button>
      </footer>
    </div>

    <FhModal v-model:visible="modalVisible" type="warning" :message="modalMessage" />
  </div>
</template>

<style scoped>
.fp-order {
  display: flex;
  flex-direction: column;
  padding: 24px 32px;
}

/* ---- 头部 ---- */

.fp-order__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--fh-gold-line);
  flex: none;
}

.fp-order__info {
  display: flex;
  align-items: center;
}

.fp-order__info-item {
  display: flex;
  flex-direction: column;
}

.fp-order__info-label {
  font-size: 13px;
  color: var(--fh-text-3);
  margin-bottom: 4px;
}

.fp-order__info-value {
  font-family: var(--fh-font-serif);
  font-size: 20px;
  font-weight: 600;
  color: var(--fh-text);
}

.fp-order__info-value--highlight {
  color: var(--fh-gold);
}

.fp-order__divider {
  width: 1px;
  height: 34px;
  background: var(--fh-line-strong);
  margin: 0 32px;
}

.fp-order__amounts {
  text-align: right;
}

.fp-order__amount-item {
  display: flex;
  align-items: baseline;
  justify-content: flex-end;
  margin-bottom: 2px;
}

.fp-order__amount-label {
  font-size: 14px;
  color: var(--fh-text-2);
  margin-right: 14px;
}

.fp-order__amount-value {
  font-size: 15px;
  color: var(--fh-text-2);
  font-variant-numeric: tabular-nums;
}

.fp-order__amount-value--discount {
  color: var(--fh-warn);
}

/* ---- 明细列表 ---- */

.fp-order__main {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 20px 4px 12px 0;
}

.fp-order__section-title {
  display: flex;
  align-items: center;
  margin: 0 0 16px;
  font-family: var(--fh-font-serif);
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 1px;
  color: var(--fh-text);
}

.fp-order__title-bar {
  width: 4px;
  height: 18px;
  border-radius: 2px;
  background: var(--fh-gold);
  margin-right: 10px;
}

.fp-order__section-count {
  font-size: 14px;
  font-weight: 400;
  color: var(--fh-text-3);
  margin-left: 10px;
}

.fp-order__group {
  margin-bottom: 18px;
}

.fp-order__group-header {
  display: flex;
  align-items: center;
  border-left: 4px solid;
  background: var(--fh-surface-2);
  border-radius: 0 var(--fh-radius-sm) var(--fh-radius-sm) 0;
  padding: 10px 16px;
  margin-bottom: 10px;
}

.fp-order__group-name {
  font-family: var(--fh-font-serif);
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.fp-order__group-count {
  font-size: 13px;
  color: var(--fh-text-3);
  margin-left: 12px;
}

.fp-order__group-discount {
  font-size: 13px;
  color: var(--fh-warn);
  margin-left: auto;
}

.fp-order__group-total {
  font-family: var(--fh-font-serif);
  font-size: 16px;
  font-weight: 700;
  color: var(--fh-text);
  margin-left: 20px;
  font-variant-numeric: tabular-nums;
}

.fp-order__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px;
  border-bottom: 1px solid var(--fh-line);
}

.fp-order__item.is-even {
  background: #f4f7fd;
}

.fp-order__item:last-child {
  border-bottom: none;
}

.fp-order__item-left {
  display: flex;
  align-items: baseline;
}

.fp-order__item-name {
  font-size: 16px;
  color: var(--fh-text);
  font-weight: 600;
}

.fp-order__item-spec {
  font-size: 13px;
  color: var(--fh-text-3);
  margin-left: 12px;
}

.fp-order__item-right {
  display: flex;
  align-items: baseline;
}

.fp-order__item-discount {
  font-size: 13px;
  color: var(--fh-warn);
  margin-right: 12px;
}

.fp-order__item-amount {
  font-family: var(--fh-font-serif);
  font-size: 17px;
  font-weight: 600;
  color: var(--fh-text);
  font-variant-numeric: tabular-nums;
}

.fp-order__empty {
  padding: 48px 0;
  text-align: center;
  color: var(--fh-text-3);
  font-size: 16px;
}

/* ---- 底部操作栏 ---- */

.fp-order__footer {
  display: flex;
  align-items: center;
  flex: none;
  padding-top: 18px;
  border-top: 1px solid var(--fh-gold-line);
}

.fp-order__pay-amount {
  display: flex;
  align-items: baseline;
}

.fp-order__pay-label {
  font-size: 15px;
  color: var(--fh-text-2);
  margin-right: 12px;
}

.fp-order__pay-value {
  font-family: var(--fh-font-serif);
  font-size: 32px;
  font-weight: 700;
  color: var(--fh-gold);
  font-variant-numeric: tabular-nums;
}

.fp-order__tips {
  flex: 1;
  margin: 0 0 0 24px;
  font-size: 13px;
  color: var(--fh-text-3);
}

.fp-order__submit {
  width: 240px;
  height: 56px;
  font-size: 19px;
  letter-spacing: 6px;
  text-indent: 6px;
  box-shadow: 0 4px 14px rgb(0 0 0 / 30%);
}

.fp-order__submit:hover:not(:disabled) {
  box-shadow: 0 6px 18px rgb(0 0 0 / 38%);
}

.fp-order__submit:disabled {
  box-shadow: none;
}
</style>
