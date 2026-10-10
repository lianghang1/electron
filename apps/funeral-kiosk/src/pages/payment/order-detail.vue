<script setup lang="ts">
import type { PayBillItem, PayBusiness, PayInvoiceInit, SettlementRequest, ThirdPartyPayResponse } from '@/api/types/payment'
import NP from 'number-precision'
import PaymentApi from '@/api/payment'
import { isBooleanFalse, isEmpty } from '@/utils'

definePage({
  meta: {
    title: '订单详情',
  },
})

interface PayMethod extends CommonType.LabelValueOption<string> {
  icon?: string
  color?: string
  code?: string
}

interface ChargeCategory {
  type: string
  label: string
  color: string
  items: PayBillItem[]
  totalAmount: number
  totalDiscount: number
  totalShould: number
}

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const { playText } = useSpeech()

const payBillItems = ref<PayBillItem[]>([])
const payMethods = ref<PayMethod[]>([])
const finalAmount = ref<number>(0)
const totalAmount = ref<number>(0)
const discountAmount = ref<number>(0)
const payBusiness = ref<PayBusiness | undefined>({})
const selectedPaymentMethod = ref<string>('')
const paymentLoading = ref(false)
const settlementInvoice = ref<PayInvoiceInit>()

const selectedPaymentMethodCode = computed(() => {
  const paymentMethod = payMethods.value.find(e => e.value === selectedPaymentMethod.value)
  if (!paymentMethod) {
    return
  }
  return paymentMethod.code || paymentMethod.value
})

const chargeCategories = computed<ChargeCategory[]>(() => {
  const categoryMap: Record<string, ChargeCategory> = {
    1: {
      type: '1',
      label: '行政性收费',
      color: '#2563eb',
      items: [],
      totalAmount: 0,
      totalDiscount: 0,
      totalShould: 0,
    },
    2: {
      type: '2',
      label: '服务型收费',
      color: '#059669',
      items: [],
      totalAmount: 0,
      totalDiscount: 0,
      totalShould: 0,
    },
    3: {
      type: '3',
      label: '经营性收费',
      color: '#d97706',
      items: [],
      totalAmount: 0,
      totalDiscount: 0,
      totalShould: 0,
    },
    other: {
      type: '-1',
      label: '其他',
      color: '#d97706',
      items: [],
      totalAmount: 0,
      totalDiscount: 0,
      totalShould: 0,
    },
  }

  payBillItems.value.forEach((item) => {
    const groupType = item.groupId || 'other'
    if (categoryMap[groupType]) {
      categoryMap[groupType].items.push(item)
      categoryMap[groupType].totalAmount = NP.plus(categoryMap[groupType].totalAmount, item.sumPrice || 0)
      categoryMap[groupType].totalDiscount = NP.plus(categoryMap[groupType].totalDiscount, item.discountPrice || 0)
      categoryMap[groupType].totalShould = NP.plus(categoryMap[groupType].totalShould, item.shouldPrice || 0)
    }
    else {
      categoryMap.other.items.push(item)
      categoryMap.other.totalAmount = NP.plus(categoryMap.other.totalAmount, item.sumPrice || 0)
      categoryMap.other.totalDiscount = NP.plus(categoryMap.other.totalDiscount, item.discountPrice || 0)
      categoryMap.other.totalShould = NP.plus(categoryMap.other.totalShould, item.shouldPrice || 0)
    }
  })

  return Object.values(categoryMap).filter(cat => cat.items.length > 0)
})

const hasChargeItems = computed(() => {
  return payBillItems.value?.length > 0
})

async function handleGetOrder() {
  const query = route.query
  const data = await PaymentApi.settlementInit({
    businessId: query.businessId as string,
    businessType: query.businessType as string,
  })

  settlementInvoice.value = data?.invoiceInit
  payBusiness.value = data?.business
  payBillItems.value = data?.billItems || []
  let shouldPrice: number = 0
  let sumPrice: number = 0
  let discountPrice: number = 0
  payMethods.value = (data?.settlementMethods || [])
    .filter(item => item.methodName && item.methodCode)
    .map((item) => {
      const extendData = item?.extendData || {}
      return {
        label: item.methodName!,
        value: item.methodCode!,
        icon: extendData.icon,
        color: extendData.color,
        code: extendData.code,
      }
    })

  for (const item of payBillItems.value) {
    shouldPrice = NP.plus(shouldPrice, item.shouldPrice || 0)
    sumPrice = NP.plus(sumPrice, item.sumPrice || 0)
    discountPrice = NP.plus(discountPrice, item.discountPrice || 0)
  }

  finalAmount.value = shouldPrice
  totalAmount.value = sumPrice
  discountAmount.value = discountPrice

  if (finalAmount.value > 0) {
    playText(`当前有待缴费项目，应付金额为${finalAmount.value}元，请按提示完成支付。`)
  }
  else {
    playText('当前无待缴费项目。如需帮助，请向工作人员咨询。')
  }

  handleCancelLastPayment()
}

async function handleCancelLastPayment() {
  if (isEmpty(payBillItems.value)) {
    return
  }
  const settlementItems: PayBillItem[] = payBillItems.value.map((item) => {
    return {
      billItemId: item.billItemId,
      orderId: item.orderId,
      orderType: item.orderType,
      orderItemId: item.orderItemId,
      paymentPrice: item.shouldPrice,
      billVersion: item.billVersion,
    }
  })
  const data = await PaymentApi.getPendingPaymentOrders(settlementItems)
  if (isEmpty(data)) {
    return
  }
  const [firstInfo] = data!
  if (['0', '1'].includes(firstInfo.payStatus)) {
    await PaymentApi.closePayOrder(firstInfo.serialNo)
  }
}

async function handlePayment() {
  if (paymentLoading.value) {
    return
  }
  const query = route.query
  try {
    paymentLoading.value = true

    const params: SettlementRequest = {
      counterId: appStore.deviceId,
      businessId: query.businessId as string,
      businessType: query.businessType as string,
      payItems: payBillItems.value.map((item) => {
        return {
          billItemId: item.billItemId,
          orderId: item.orderId,
          orderType: item.orderType,
          orderItemId: item.orderItemId,
          paymentPrice: item.shouldPrice,
          billVersion: item.billVersion,
        }
      }),
      settlementMethods: [
        {
          methodCode: selectedPaymentMethodCode.value,
          paymentPrice: finalAmount.value,
        },
      ],
      invoiceType: '2',
      settlementInvoice: settlementInvoice.value,
    }
    const data = await PaymentApi.settlement<ThirdPartyPayResponse>(params)
    if (isBooleanFalse(data?.thirdPartyPay)) {
      // TODO 内部支付
      return
    }
    const payData = data!.payResponse
    router.replace({
      path: '/payment/pay',
      query: {
        serialNo: payData.serialNo,
        businessId: query.businessId as string,
        businessType: query.businessType as string,
      },
    })
  }
  finally {
    paymentLoading.value = false
  }
}

onMounted(() => {
  handleGetOrder()
})
</script>

<template>
  <div class="order-page">
    <div class="order-container">
      <header class="page-header">
        <div class="header-left">
          <div class="business-info">
            <div class="info-item">
              <span class="label">逝者姓名</span>
              <span class="value">{{ payBusiness?.userName || '-' }}</span>
            </div>
            <div class="info-divider" />
            <div class="info-item">
              <span class="label">经办人姓名</span>
              <span class="value">{{ payBusiness?.linkman || '-' }}</span>
            </div>
            <div class="info-divider" />
            <div class="info-item">
              <span class="label">业务编号</span>
              <span class="value highlight">{{ payBusiness?.businessNo || '-' }}</span>
            </div>
          </div>
        </div>
        <div class="header-right">
          <div class="amount-summary">
            <div class="amount-item">
              <span class="label">总金额</span>
              <span class="value">¥{{ totalAmount.toFixed(2) }}</span>
            </div>
            <div v-if="discountAmount > 0" class="amount-item discount">
              <span class="label">优惠</span>
              <span class="value">¥{{ discountAmount.toFixed(2) }}</span>
            </div>
            <div class="amount-item total">
              <span class="label">应付金额</span>
              <span class="value">¥{{ finalAmount.toFixed(2) }}</span>
            </div>
          </div>
        </div>
      </header>

      <main class="page-content">
        <div class="charge-section">
          <div class="section-header">
            <h3 class="section-title">
              <span class="title-bar" />
              收费项目
              <span class="count">共 {{ payBillItems.length }} 项</span>
            </h3>
          </div>
          <div class="charge-list">
            <div
              v-for="category in chargeCategories"
              :key="category.type"
              class="category-group"
            >
              <div class="category-header" :style="{ borderLeftColor: category.color }">
                <span class="category-dot" :style="{ background: category.color }" />
                <span class="category-name">{{ category.label }}</span>
                <span class="category-count">{{ category.items.length }}项</span>
                <span v-if="category.totalDiscount > 0" class="category-discount">已优惠 ¥{{ category.totalDiscount.toFixed(2) }}</span>
                <span class="category-total">¥{{ category.totalShould.toFixed(2) }}</span>
              </div>
              <div class="category-items">
                <div
                  v-for="(item, idx) in category.items"
                  :key="idx"
                  class="charge-item"
                  :class="{ 'has-discount': item.discountPrice && item.discountPrice > 0 }"
                >
                  <div class="item-left">
                    <span class="item-name">{{ item.itemName }}</span>
                    <span class="item-spec">¥{{ item.price }} × {{ item.qty }}</span>
                  </div>
                  <div class="item-right">
                    <span v-if="item.discountPrice && item.discountPrice > 0" class="item-discount">优惠 ¥{{ item.discountPrice }}</span>
                    <span class="item-amount">¥{{ item.shouldPrice }}</span>
                  </div>
                </div>
              </div>
            </div>
            <div v-if="!hasChargeItems" class="empty-state">
              暂无收费项目
            </div>
          </div>
        </div>
      </main>

      <footer class="page-footer">
        <div class="footer-left">
          <div class="tips-box">
            <div class="tips-header">
              <span class="tips-icon" />
              温馨提示
            </div>
            <div class="tips-content">
              <p>请仔细核对订单信息，确认无误后再进行支付</p>
              <p>支付成功后，系统将自动生成缴费凭证</p>
              <p>如有疑问，请联系工作人员</p>
              <p class="warning">
                本自助机仅支持开具个人发票，若需开具公司发票，请前往收银柜台办理
              </p>
            </div>
          </div>
        </div>
        <div class="footer-right">
          <div class="payment-box">
            <div class="method-label">
              选择支付方式
            </div>
            <div class="method-list">
              <button
                v-for="method in payMethods"
                :key="method.value"
                class="method-btn"
                :class="{ active: selectedPaymentMethod === method.value }"
                @click="selectedPaymentMethod = method.value"
              >
                <span class="method-icon" :class="method.icon" :style="{ color: method.color }" />
                <span class="method-name">{{ method.label }}</span>
              </button>
            </div>
            <button
              class="pay-btn"
              :class="{ active: selectedPaymentMethod && !paymentLoading }"
              :disabled="!selectedPaymentMethod || paymentLoading"
              @click="handlePayment"
            >
              <span v-if="paymentLoading" class="loading-icon" />
              <template v-else>
                <span class="btn-text">立即支付</span>
                <span class="btn-amount">¥{{ finalAmount.toFixed(2) }}</span>
              </template>
            </button>
          </div>
        </div>
      </footer>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.order-page {
  width: 100%;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.order-container {
  width: 100%;
  height: 100%;
  max-width: 1600px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  padding: 24px 32px;
  gap: 20px;
}

.page-header {
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: white;
  border-radius: 16px;
  padding: 20px 28px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}

.header-left {
  flex: 1;
}

.business-info {
  display: flex;
  align-items: center;
  gap: 24px;
  flex-wrap: wrap;

  @media (max-width: 1200px) {
    gap: 16px;
  }
}

.info-item {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;

  @media (max-width: 1200px) {
    gap: 8px;
  }

  .label {
    font-size: 14px;
    color: #999;
    white-space: nowrap;
  }

  .value {
    font-size: 18px;
    font-weight: 600;
    color: #1a1a1a;
    white-space: nowrap;

    @media (max-width: 1200px) {
      font-size: 16px;
    }

    &.highlight {
      color: var(--v-color-primary);
    }
  }
}

.info-divider {
  width: 1px;
  height: 24px;
  background: #e8e8e8;
  flex-shrink: 0;

  @media (max-width: 768px) {
    display: none;
  }
}

.header-right {
  flex-shrink: 0;
}

.amount-summary {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 10px 20px;
  background: linear-gradient(135deg, #f8f9fa 0%, #f0f2f5 100%);
  border-radius: 10px;

  @media (max-width: 1200px) {
    gap: 16px;
    padding: 8px 16px;
  }

  @media (max-width: 768px) {
    gap: 12px;
    padding: 8px 12px;
  }
}

.amount-item {
  display: flex;
  align-items: center;
  gap: 6px;

  .label {
    font-size: 13px;
    color: #8c8c8c;
    white-space: nowrap;
  }

  .value {
    font-size: 16px;
    font-weight: 600;
    color: #333;
    white-space: nowrap;
  }

  &.discount .value {
    color: #18a058;
    font-size: 15px;
  }

  &.total {
    padding-left: 16px;
    border-left: 1px solid #e0e0e0;

    @media (max-width: 768px) {
      padding-left: 12px;
    }

    .label {
      font-weight: 500;
      color: #666;
    }

    .value {
      font-size: 22px;
      font-weight: 700;
      color: #ff4d4f;

      @media (max-width: 1200px) {
        font-size: 20px;
      }

      @media (max-width: 768px) {
        font-size: 18px;
      }
    }
  }
}

.page-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.charge-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: white;
  border-radius: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  overflow: hidden;
}

.section-header {
  flex-shrink: 0;
  padding: 24px 32px;
  border-bottom: 1px solid #f0f0f0;
  background: linear-gradient(to bottom, #fafbfc, #ffffff);
}

.section-title {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 18px;
  font-weight: 600;
  color: #1a1a1a;
  margin: 0;

  .title-bar {
    width: 4px;
    height: 20px;
    background: linear-gradient(180deg, #8b5cf6, #6366f1);
    border-radius: 2px;
  }

  .count {
    font-size: 14px;
    font-weight: 400;
    color: #999;
    background: #f5f5f5;
    padding: 2px 10px;
    border-radius: 12px;
  }
}

.charge-list {
  flex: 1;
  overflow-y: auto;
  padding: 24px 32px;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-thumb {
    background: #d9d9d9;
    border-radius: 3px;

    &:hover {
      background: #bfbfbf;
    }
  }
}

.category-group {
  margin-bottom: 28px;

  &:last-child {
    margin-bottom: 0;
  }
}

.category-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  padding: 12px 16px;
  background: linear-gradient(135deg, #f8f9fa 0%, #f0f2f5 100%);
  border-radius: 10px;
  border-left: 4px solid;

  .category-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .category-name {
    font-size: 16px;
    font-weight: 600;
    color: #1a1a1a;
  }

  .category-count {
    font-size: 12px;
    color: #999;
    background: white;
    padding: 2px 8px;
    border-radius: 10px;
  }

  .category-discount {
    font-size: 13px;
    color: #18a058;
    background: #e8f8f0;
    padding: 2px 10px;
    border-radius: 10px;
    font-weight: 500;
  }

  .category-total {
    margin-left: auto;
    font-size: 18px;
    font-weight: 700;
    color: #1a1a1a;
  }
}

.category-items {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 12px;
}

.charge-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  background: linear-gradient(135deg, #ffffff 0%, #fafafa 100%);
  border-radius: 10px;
  gap: 16px;
  transition: all 0.2s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);

  &:hover {
    background: linear-gradient(135deg, #f5f7fa 0%, #f0f2f5 100%);
    transform: translateX(4px);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
  }

  &.has-discount {
    background: linear-gradient(135deg, #f0faf4 0%, #e8fcf0 100%);
    border: 1px solid #c8f5dc;

    &:hover {
      background: linear-gradient(135deg, #e8fcf0 0%, #d9f8e8 100%);
    }
  }

  .item-left {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    min-width: 0;
  }

  .item-right {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
  }

  .item-name {
    font-size: 15px;
    color: #333;
    font-weight: 500;
  }

  .item-spec {
    margin-top: 2px;
    font-size: 13px;
    color: #666;
    white-space: nowrap;
    background: #f0f0f0;
    padding: 3px 10px;
    border-radius: 6px;
    width: fit-content;
    border: 1px solid #e8e8e8;
  }

  .item-discount {
    font-size: 13px;
    color: #18a058;
    font-weight: 600;
    background: #ecfdf5;
    padding: 4px 10px;
    border-radius: 6px;
    white-space: nowrap;
  }

  .item-amount {
    font-size: 16px;
    font-weight: 700;
    color: #1a1a1a;
    min-width: 80px;
    text-align: right;
  }
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: #999;
  font-size: 16px;
}

.page-footer {
  flex-shrink: 0;
  display: flex;
  gap: 20px;
  min-height: 180px;
}

.footer-left {
  flex: 1;
  min-width: 0;
}

.tips-box {
  height: 100%;
  background: white;
  border-radius: 16px;
  padding: 20px 24px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
}

.tips-header {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 600;
  color: #1a1a1a;
  margin-bottom: 12px;

  .tips-icon {
    width: 4px;
    height: 18px;
    background: #f59e0b;
    border-radius: 2px;
  }
}

.tips-content {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  align-content: center;
  gap: 6px 24px;

  p {
    font-size: 15px;
    color: #666;
    margin: 0;
    line-height: 1.6;
    position: relative;
    padding-left: 14px;

    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 8px;
      width: 5px;
      height: 5px;
      background: #d9d9d9;
      border-radius: 50%;
    }

    &.warning {
      color: #ff4d4f;
      font-weight: 500;

      &::before {
        background: #ff4d4f;
      }
    }
  }
}

.footer-right {
  width: 400px;
  flex-shrink: 0;
}

.payment-box {
  height: 100%;
  background: white;
  border-radius: 16px;
  padding: 20px 24px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
}

.method-label {
  font-size: 14px;
  color: #666;
  margin-bottom: 12px;
}

.method-list {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
}

.method-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 12px 20px;
  background: #fafafa;
  border: 2px solid #e8e8e8;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 140px;
  flex: 1;

  .method-icon {
    font-size: 24px;
  }

  .method-name {
    font-size: 15px;
    font-weight: 500;
    color: #333;
  }

  &:hover {
    background: #f5f5f5;
  }

  &.active {
    border-color: #003594;
    background: #e6efff;
  }
}

.pay-btn {
  width: 100%;
  padding: 16px;
  background: #d9d9d9;
  border: none;
  border-radius: 10px;
  color: white;
  font-size: 18px;
  font-weight: 600;
  cursor: not-allowed;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: auto;

  .loading-icon {
    width: 24px;
    height: 24px;
    border: 3px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .btn-text {
    font-size: 18px;
  }

  .btn-amount {
    font-size: 24px;
    font-weight: 700;
  }

  &.active {
    background: linear-gradient(135deg, #ff4d4f, #ff7875);
    cursor: pointer;
    box-shadow: 0 4px 16px rgba(255, 77, 79, 0.3);

    &:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 20px rgba(255, 77, 79, 0.4);
    }
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1200px) {
  .page-footer {
    flex-direction: column;
    min-height: auto;
  }

  .footer-right {
    width: 100%;
  }

  .payment-box {
    flex-direction: row;
    align-items: center;
    gap: 20px;

    .method-list {
      flex: 1;
      flex-direction: row;
      margin-bottom: 0;
    }

    .pay-btn {
      width: auto;
      padding: 14px 32px;
      margin-top: 0;
    }
  }
}

@media (max-width: 768px) {
  .order-container {
    padding: 16px;
  }

  .page-header {
    flex-direction: column;
    gap: 16px;
    align-items: flex-start;
  }

  .business-info {
    flex-wrap: wrap;
  }

  .amount-summary {
    flex-wrap: wrap;
    gap: 16px;
  }

  .category-items {
    grid-template-columns: 1fr;
  }
}
</style>
