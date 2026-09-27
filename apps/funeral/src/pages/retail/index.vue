<script setup lang="ts">
import type { ProductItem, RetailItem, SettlementMethod } from '../../types/funeral'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { fh } from '../../api/fh'
import FhModal from '../../components/FhModal.vue'

/**
 * 丧葬用品零售：商品网格加购物车，结账后创建零售单并直接进入扫码支付。
 */
const router = useRouter()

/** 分类标签（与商品 sortId 对齐） */
const SORT_LABELS: Record<string, string> = {
  '01': '花圈花篮',
  '02': '祭祀用品',
  '03': '随葬用品',
}

const products = ref<ProductItem[]>([])
const cart = ref<{ product: ProductItem, qty: number }[]>([])
const currentCategory = ref('all')
const payMethods = ref<SettlementMethod[]>([])
const selectedMethod = ref('')
const machineId = ref('')
const counterName = ref('')
const submitting = ref(false)

const modalVisible = ref(false)
const modalMessage = ref('')

function add(a: number, b: number): number {
  return Math.round((a + b) * 100) / 100
}

const categoryTabs = computed(() => {
  const tabs = [{ value: 'all', label: '全部商品' }]
  const seen = new Set<string>()
  for (const item of products.value) {
    if (item.sortId && !seen.has(item.sortId)) {
      seen.add(item.sortId)
      tabs.push({ value: item.sortId, label: SORT_LABELS[item.sortId] || item.sortId })
    }
  }
  return tabs
})

const filteredProducts = computed(() => {
  if (currentCategory.value === 'all')
    return products.value
  return products.value.filter(item => item.sortId === currentCategory.value)
})

const cartTotalQty = computed(() => cart.value.reduce((sum, item) => sum + item.qty, 0))

const cartTotalPrice = computed(() => cart.value.reduce((sum, item) => add(sum, (item.product.price || 0) * item.qty), 0))

const submitDisabled = computed(() => !cart.value.length || !selectedMethod.value)

function addToCart(product: ProductItem): void {
  const existing = cart.value.find(item => item.product.itemId === product.itemId)
  if (existing)
    existing.qty++
  else
    cart.value.push({ product, qty: 1 })
}

function changeQty(itemId: string, delta: number): void {
  const item = cart.value.find(entry => entry.product.itemId === itemId)
  if (!item)
    return
  item.qty += delta
  if (item.qty <= 0)
    cart.value = cart.value.filter(entry => entry.product.itemId !== itemId)
}

function clearCart(): void {
  cart.value = []
}

async function handleSubmit(): Promise<void> {
  if (submitDisabled.value || submitting.value)
    return
  submitting.value = true
  try {
    const items: RetailItem[] = cart.value.map(({ product, qty }) => ({
      itemId: product.itemId,
      itemType: product.itemType,
      itemName: product.itemName,
      qty,
      price: product.price,
      sortId: product.sortId,
      itemUnit: product.unit,
      itemSpec: product.spec,
      storeId: product.storeId,
    }))

    // 创建零售单 → 结算初始化取应付 → 提交结算进扫码支付
    const retail = await fh.retail({ counterName: counterName.value, businessSource: '2', items })
    const init = await fh.settlementInit({ businessId: retail.id, businessType: retail.payBusinessType })
    const shouldPrice = (init.billItems || []).reduce((sum, item) => add(sum, item.shouldPrice || 0), 0)

    const method = payMethods.value.find(m => m.methodCode === selectedMethod.value)
    const response = await fh.settlement({
      counterId: machineId.value,
      businessId: retail.id,
      businessType: retail.payBusinessType,
      payItems: (init.billItems || []).map(item => ({
        billItemId: item.billItemId,
        orderId: item.orderId,
        orderType: item.orderType,
        orderItemId: item.orderItemId,
        paymentPrice: item.shouldPrice,
        billVersion: item.billVersion,
      })),
      settlementMethods: [
        {
          methodCode: method?.extendData?.code || method?.methodCode || selectedMethod.value,
          paymentPrice: shouldPrice,
        },
      ],
      invoiceType: '2',
      settlementInvoice: init.invoiceInit,
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
        businessId: retail.id,
        businessType: retail.payBusinessType,
      },
    })
  }
  finally {
    submitting.value = false
  }
}

onMounted(async () => {
  try {
    const config = await fh.getConfig()
    machineId.value = config.machineId
    counterName.value = config.counterName
  }
  catch {
    // 配置不可用时使用空值
  }
  const [list, methods] = await Promise.all([
    fh.getProductList({ onlineFlag: true }),
    fh.getSettlementMethods().catch(() => [] as SettlementMethod[]),
  ])
  products.value = list
  payMethods.value = methods.filter(m => m.methodName && m.methodCode)
  if (payMethods.value.length && !selectedMethod.value)
    selectedMethod.value = payMethods.value[0].methodCode || ''
})
</script>

<template>
  <div class="fh-page">
    <div class="fh-page-content fp-retail">
      <!-- 商品区 -->
      <div class="fp-retail__main">
        <div class="fp-retail__cats">
          <button
            v-for="tab in categoryTabs"
            :key="tab.value"
            class="fp-retail__cat"
            :class="{ 'is-active': currentCategory === tab.value }"
            @click="currentCategory = tab.value"
          >
            {{ tab.label }}
          </button>
        </div>

        <div class="fp-retail__grid">
          <button
            v-for="product in filteredProducts"
            :key="product.itemId"
            class="fp-retail__card"
            @click="addToCart(product)"
          >
            <span class="fp-retail__pic">
              <svg v-if="product.sortId === '01'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                <circle cx="12" cy="9" r="2.2" />
                <path d="M12 6.8c-1.2-1.8-.6-3.6 0-4.4.6.8 1.2 2.6 0 4.4ZM14.4 8.6c2-.8 3.7 0 4.4.8-.9.5-2.7 1-4.4-.8ZM9.6 8.6c-2-.8-3.7 0-4.4.8.9.5 2.7 1 4.4-.8ZM12 11.2v3" />
                <path d="M8 20c.8-2.4 2.2-3.6 4-3.6s3.2 1.2 4 3.6" />
              </svg>
              <svg v-else-if="product.sortId === '02'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                <path d="M9 3.5v7M12 3.5v7M15 3.5v7" />
                <path d="M7.5 10.5h9M6 14.5c0-1.6 1.2-2.8 3-3h6c1.8.2 3 1.4 3 3v3H6v-3Z" />
                <path d="M5 20.5h14" />
              </svg>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                <path d="M7 4.5h10M6.5 7h11" />
                <path d="M7 7v9a3.5 3.5 0 0 0 3.5 3.5h3A3.5 3.5 0 0 0 17 16V7" />
                <path d="M9 12h6" />
              </svg>
            </span>
            <span class="fp-retail__name">{{ product.itemName }}</span>
            <span class="fp-retail__meta">
              <span class="fp-retail__price">¥{{ product.price }}</span>
              <span v-if="product.unit" class="fp-retail__unit">/ {{ product.unit }}</span>
            </span>
            <span class="fp-retail__hint">点击购买</span>
          </button>

          <div v-if="!filteredProducts.length" class="fp-retail__empty">
            暂无商品
          </div>
        </div>
      </div>

      <!-- 购物车 -->
      <aside class="fp-retail__cart">
        <header class="fp-retail__cart-head">
          <span class="fp-retail__cart-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 4h2l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.4-1.1L21 8H6" />
              <circle cx="10" cy="20" r="1.4" />
              <circle cx="17.5" cy="20" r="1.4" />
            </svg>
            购物车
            <i v-if="cartTotalQty > 0" class="fp-retail__badge">{{ cartTotalQty }}</i>
          </span>
          <button v-if="cart.length" class="fp-retail__clear" @click="clearCart">
            清空
          </button>
        </header>

        <div class="fp-retail__cart-list">
          <div v-if="!cart.length" class="fp-retail__cart-empty">
            <p>购物车是空的</p>
            <p class="fp-retail__cart-empty-sub">
              点击左侧商品添加
            </p>
          </div>
          <div v-for="item in cart" :key="item.product.itemId" class="fp-retail__cart-item">
            <div class="fp-retail__cart-info">
              <div class="fp-retail__cart-name">
                {{ item.product.itemName }}
              </div>
              <div class="fp-retail__cart-price">
                ¥{{ item.product.price }}
              </div>
            </div>
            <div class="fp-retail__stepper">
              <button class="fp-retail__step" @click="changeQty(item.product.itemId, -1)">
                −
              </button>
              <span class="fp-retail__qty">{{ item.qty }}</span>
              <button class="fp-retail__step" @click="changeQty(item.product.itemId, 1)">
                +
              </button>
            </div>
          </div>
        </div>

        <footer class="fp-retail__cart-foot">
          <div class="fp-retail__row">
            <span>商品数量</span>
            <span class="fp-retail__row-value">{{ cartTotalQty }} 件</span>
          </div>
          <div class="fp-retail__row fp-retail__row--total">
            <span>合计金额</span>
            <span class="fp-retail__row-price">¥{{ cartTotalPrice.toFixed(2) }}</span>
          </div>

          <div v-if="payMethods.length > 1" class="fp-retail__pay-label">
            选择支付方式
          </div>
          <div v-if="payMethods.length > 1" class="fp-retail__pay-options">
            <button
              v-for="method in payMethods"
              :key="method.methodCode"
              class="fp-retail__pay-option"
              :class="{ 'is-active': selectedMethod === method.methodCode }"
              @click="selectedMethod = method.methodCode || ''"
            >
              {{ method.methodName }}
            </button>
          </div>

          <button class="fh-btn fh-btn--primary fp-retail__checkout" :disabled="submitDisabled || submitting" @click="handleSubmit">
            {{ submitting ? '正在创建订单...' : '确认结账' }}
          </button>
        </footer>
      </aside>
    </div>

    <FhModal v-model:visible="modalVisible" type="warning" :message="modalMessage" />
  </div>
</template>

<style scoped>
.fp-retail {
  display: flex;
  padding: 20px 24px;
}

.fp-retail__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

/* ---- 分类 ---- */

.fp-retail__cats {
  display: flex;
  flex: none;
  margin-bottom: 16px;
}

.fp-retail__cat {
  height: 42px;
  padding: 0 24px;
  margin-right: 12px;
  border: 1px solid var(--fh-line-strong);
  border-radius: 999px;
  background: var(--fh-surface);
  color: var(--fh-text-2);
  font-family: inherit;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.fp-retail__cat.is-active {
  background: var(--fh-ink);
  border-color: var(--fh-ink);
  color: #fff;
}

/* ---- 商品网格 ---- */

.fp-retail__grid {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  align-content: start;
}

.fp-retail__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  border: 1px solid var(--fh-line);
  border-radius: var(--fh-radius);
  background: var(--fh-surface);
  padding: 14px 12px 12px;
  margin: 0 12px 12px 0;
  font-family: inherit;
  cursor: pointer;
  transition: border-color 0.15s ease, transform 0.15s ease;
}

.fp-retail__card:hover {
  border-color: var(--fh-gold);
  transform: translateY(-2px);
}

.fp-retail__card:active {
  transform: scale(0.98);
}

.fp-retail__pic {
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(36 86 184 / 8%);
  border-radius: var(--fh-radius-sm);
  margin-bottom: 10px;
}

.fp-retail__pic svg {
  width: 34px;
  height: 34px;
  color: var(--fh-ink);
}

.fp-retail__name {
  font-size: 15px;
  font-weight: 600;
  color: var(--fh-text);
  text-align: center;
  line-height: 1.3;
}

.fp-retail__meta {
  display: flex;
  align-items: baseline;
  margin-top: 6px;
}

.fp-retail__price {
  font-size: 17px;
  font-weight: 700;
  color: var(--fh-gold);
  font-variant-numeric: tabular-nums;
}

.fp-retail__unit {
  font-size: 12px;
  color: var(--fh-text-3);
  margin-left: 2px;
}

.fp-retail__hint {
  font-size: 12px;
  color: var(--fh-text-3);
  margin-top: 6px;
}

.fp-retail__empty {
  grid-column: 1 / -1;
  padding: 64px 0;
  text-align: center;
  color: var(--fh-text-3);
  font-size: 16px;
}

/* ---- 购物车 ---- */

.fp-retail__cart {
  width: 340px;
  flex: none;
  margin-left: 16px;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--fh-line);
  border-radius: var(--fh-radius);
  background: var(--fh-surface);
  overflow: hidden;
}

.fp-retail__cart-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--fh-line);
  flex: none;
}

.fp-retail__cart-title {
  display: flex;
  align-items: center;
  font-size: 17px;
  font-weight: 700;
  color: var(--fh-text);
}

.fp-retail__cart-title svg {
  width: 20px;
  height: 20px;
  margin-right: 8px;
  color: var(--fh-ink);
}

.fp-retail__badge {
  font-style: normal;
  min-width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 11px;
  background: var(--fh-gold);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  padding: 0 6px;
  margin-left: 8px;
  font-variant-numeric: tabular-nums;
}

.fp-retail__clear {
  border: none;
  background: none;
  color: var(--fh-text-3);
  font-family: inherit;
  font-size: 14px;
  cursor: pointer;
}

.fp-retail__clear:hover {
  color: var(--fh-danger);
}

.fp-retail__cart-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px 18px;
}

.fp-retail__cart-empty {
  padding: 48px 0;
  text-align: center;
  color: var(--fh-text-3);
  font-size: 15px;
}

.fp-retail__cart-empty-sub {
  font-size: 13px;
  margin-top: 6px;
  color: var(--fh-text-3);
  opacity: 0.8;
}

.fp-retail__cart-empty p {
  margin: 0;
}

.fp-retail__cart-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid var(--fh-line);
}

.fp-retail__cart-item:last-child {
  border-bottom: none;
}

.fp-retail__cart-name {
  font-size: 15px;
  color: var(--fh-text);
  font-weight: 500;
}

.fp-retail__cart-price {
  font-size: 14px;
  color: var(--fh-text-2);
  margin-top: 4px;
  font-variant-numeric: tabular-nums;
}

.fp-retail__stepper {
  display: flex;
  align-items: center;
}

.fp-retail__step {
  width: 32px;
  height: 32px;
  border: 1px solid var(--fh-line-strong);
  border-radius: var(--fh-radius-sm);
  background: var(--fh-surface);
  color: var(--fh-text);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  font-family: inherit;
}

.fp-retail__step:hover {
  border-color: var(--fh-ink);
}

.fp-retail__qty {
  min-width: 32px;
  text-align: center;
  font-size: 16px;
  font-weight: 700;
  color: var(--fh-text);
  font-variant-numeric: tabular-nums;
}

/* ---- 结账区 ---- */

.fp-retail__cart-foot {
  flex: none;
  padding: 14px 18px 18px;
  border-top: 1px solid var(--fh-line);
}

.fp-retail__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 14px;
  color: var(--fh-text-2);
}

.fp-retail__row-value {
  font-weight: 600;
  color: var(--fh-text);
}

.fp-retail__row-price {
  font-size: 22px;
  font-weight: 700;
  color: var(--fh-gold);
  font-variant-numeric: tabular-nums;
}

.fp-retail__pay-label {
  font-size: 13px;
  color: var(--fh-text-2);
  margin: 10px 0 8px;
}

.fp-retail__pay-options {
  display: flex;
  margin-bottom: 12px;
}

.fp-retail__pay-option {
  flex: 1;
  height: 40px;
  border: 1px solid var(--fh-line-strong);
  background: var(--fh-surface);
  color: var(--fh-text-2);
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.fp-retail__pay-option:first-child {
  border-radius: var(--fh-radius-sm) 0 0 var(--fh-radius-sm);
}

.fp-retail__pay-option:last-child {
  border-radius: 0 var(--fh-radius-sm) var(--fh-radius-sm) 0;
  border-left: none;
}

.fp-retail__pay-option.is-active {
  background: var(--fh-ink);
  border-color: var(--fh-ink);
  color: #fff;
}

.fp-retail__checkout {
  width: 100%;
  height: 52px;
  font-size: 17px;
}
</style>
