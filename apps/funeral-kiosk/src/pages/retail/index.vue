<script setup lang="ts">
import type { ProductItem, RetailItem } from '@/api/types/product'
import NP from 'number-precision'
import PaymentApi from '@/api/payment'
import ProductApi from '@/api/product'
import { useGlobalLoadingStore } from '@/layouts/legacy-layout/store'
import { formatNumber, isEmpty } from '@/utils'
import RetailPayInfo from './components/RetailPayInfo.vue'

definePage({
  meta: {
    title: '丧葬用品',
  },
})

interface PayMethod extends CommonType.LabelValueOption<string> {
  icon?: string
  color?: string
  code?: string
}

interface ProductData extends ProductItem {
  _itemKey: string
  _picKey?: string
}

interface CartItem extends ProductData {
  qty: number
  sumPrice: number
}

const defaultImage = 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'200\' height=\'200\' viewBox=\'0 0 200 200\'%3E%3Crect fill=\'%23f1f5f9\' width=\'200\' height=\'200\'/%3E%3Ctext fill=\'%2394a3b8\' font-family=\'sans-serif\' font-size=\'20\' dy=\'10.5\' font-weight=\'bold\' x=\'50%25\' y=\'50%25\' text-anchor=\'middle\'%3E暂无图片%3C/text%3E%3C/svg%3E'

const containerRef = useTemplateRef('containerRef')
const retailPayInfoRef = useTemplateRef('retailPayInfoRef')
const { resolveFile } = useFileResolver()
const appStore = useAppStore()
const globalLoading = useGlobalLoadingStore()

const payMethods = ref<PayMethod[]>([])
const cart = ref<CartItem[]>([])
const products = ref<ProductData[]>([])
const categories = ref([
  { value: 'all', label: '全部商品' },
])
const selectedPaymentMethod = ref<string>('')

const currentCategory = ref('all')
const badgeBounce = ref(false)

const cartTotalQty = computed(() => cart.value.reduce((sum, item) => sum + item.qty, 0))

const cartTotalPrice = computed(() => cart.value.reduce((sum, item) => NP.plus(sum, item.sumPrice || 0), 0))

const submitDisabled = computed(() => {
  return isEmpty(cart.value) || isEmpty(selectedPaymentMethod.value)
})

const selectedPaymentMethodCode = computed(() => {
  const paymentMethod = payMethods.value.find(e => e.value === selectedPaymentMethod.value)
  if (!paymentMethod) {
    return
  }
  return paymentMethod.code || paymentMethod.value
})

function addToCart(product: ProductData, event: Event) {
  const existingItem = cart.value.find(item => item._itemKey === product._itemKey)
  if (existingItem) {
    existingItem.qty++
    existingItem.sumPrice = NP.times(existingItem.qty, existingItem.price)
  }
  else {
    cart.value.push({ ...product, qty: 1, sumPrice: product.price })
  }

  // 徽章动画
  badgeBounce.value = false
  nextTick(() => badgeBounce.value = true)

  if (containerRef.value) {
    const currentTarget = event.currentTarget as HTMLElement
    const rect = currentTarget.getBoundingClientRect()

    const ball = document.createElement('div')
    ball.className = 'fly-ball'
    ball.style.backgroundImage = `url('${product.pic}')`

    const left = rect.left + rect.width / 2 - 20
    const top = rect.top + rect.height / 2 - 20

    ball.style.left = `${left}px`
    ball.style.top = `${top}px`

    containerRef.value.appendChild(ball)
    setTimeout(() => ball.remove(), 600)
  }
}

function changeQty(id: string, delta: number) {
  const item = cart.value.find(i => i._itemKey === id)
  if (item) {
    item.qty += delta
    item.sumPrice = NP.times(item.qty, item.price)
    if (item.qty <= 0) {
      cart.value = cart.value.filter(i => i._itemKey !== id)
    }
  }
}

function clearCart() {
  cart.value = []
}

function handleImgLoadError(event: Event) {
  const target = event.target as HTMLImageElement
  target.src = defaultImage
}

async function handleResolveFiles() {
  for (const item of products.value) {
    if (!item.pic) {
      item.pic = defaultImage
      continue
    }
    const fileInfo = await resolveFile(item.pic)
    item.pic = fileInfo.firstUrl
  }
}

async function handleSubmit() {
  if (isEmpty(cart.value)) {
    return
  }
  globalLoading.showLoading()
  try {
    const retailItems: RetailItem[] = cart.value.map((item) => {
      return {
        itemId: item.itemId,
        itemType: item.itemType,
        itemName: item.itemName,
        qty: item.qty,
        price: item.price,
        sortId: item.sortId,
        itemPic: item._picKey,
        itemUnit: item.unit,
        itemSpec: item.spec,
        storeId: item.storeId,
      } as RetailItem
    })

    const businessSource = appStore.deviceBusinessType === '8' ? '3' : '2'
    const data = await ProductApi.retail({
      counterName: appStore.deviceName,
      businessSource,
      items: retailItems,
    })
    await retailPayInfoRef.value!.open({
      businessId: data!.id,
      businessType: data!.payBusinessType,
      paymentMethod: selectedPaymentMethodCode.value!,
    })
  }
  finally {
    globalLoading.hideLoading()
  }
}

async function handleGetPayMethods() {
  const data = await PaymentApi.getSettlementMethods()

  payMethods.value = (data || [])
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
}

async function handleGetData() {
  const deviceId = appStore.deviceId
  if (!deviceId) {
    products.value = []
    return
  }
  const data = await ProductApi.getList({
    filterCode: `counter_${deviceId}`,
  })
  products.value = (data || []).map((item) => {
    return {
      ...item,
      _picKey: item.pic,
      _itemKey: `${item.itemType}_${item.itemId}_${item.sortId}`,
    } as ProductData
  })
  handleResolveFiles()
}

onMounted(() => {
  handleGetPayMethods()
  handleGetData()
})
</script>

<template>
  <div class="retail-page">
    <div ref="containerRef" class="page-container">
      <div class="main-content">
        <div>
          <!-- 搜索 -->
          <!-- <div class="search-bar">
            <div class="search-input-wrapper">
              <svg class="search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input type="text" class="search-input" placeholder="搜索商品名称...">
            </div>
            <button class="btn-help">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              帮助
            </button>
          </div> -->

          <!-- 分类 -->
          <div class="category-wrapper">
            <div class="category-tabs">
              <button
                v-for="cat in categories" :key="cat.value" class="category-btn"
                :class="{ active: currentCategory === cat.value }" @click="currentCategory = cat.value"
              >
                {{ cat.label }}
              </button>
            </div>
          </div>
        </div>

        <!-- 商品列表 -->
        <div class="product-grid-container">
          <div class="product-grid">
            <div
              v-for="product in products" :key="product._itemKey" class="product-card"
              @click="addToCart(product, $event)"
            >
              <div class="product-image">
                <img :src="product.pic" :alt="product.itemName" @error="handleImgLoadError">
                <!-- <span v-if="product.tag" class="product-tag" :class="product.tag === 'hot' ? 'tag-hot' : 'tag-new'">
                  {{ product.tag === 'hot' ? '热销' : '新品' }}
                </span> -->
              </div>
              <div class="product-name">
                {{ product.itemName }}
              </div>
              <div class="product-footer">
                <span class="product-price">¥{{ formatNumber(product.price) }}</span>
                <span class="product-hint">点击购买</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="cart-panel">
        <div class="cart-header">
          <div class="cart-title">
            <div class="cart-icon-wrapper">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
              <span v-if="cartTotalQty > 0" class="cart-badge" :class="{ 'badge-animate': badgeBounce }">
                {{ cartTotalQty }}
              </span>
            </div>
            <span>购物车</span>
          </div>
          <button v-if="cart.length > 0" class="btn-clear" @click="clearCart">
            清空
          </button>
        </div>

        <div class="cart-list">
          <div v-if="cart.length === 0" class="cart-empty">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
              />
            </svg>
            <p>购物车是空的</p>
            <p style="font-size: 13px; margin-top: 8px;">
              点击商品添加到购物车
            </p>
          </div>

          <div v-for="item in cart" :key="item._itemKey" class="cart-item">
            <div class="cart-item-img">
              <img :src="item.pic" :alt="item.itemName" @error="handleImgLoadError">
            </div>
            <div class="cart-item-info">
              <div class="cart-item-name">
                {{ item.itemName }}
              </div>
              <div class="cart-item-price">
                ¥{{ formatNumber(item.price) }}
              </div>
            </div>
            <div class="cart-item-controls">
              <button class="qty-btn" @click="changeQty(item._itemKey, -1)">
                −
              </button>
              <div class="cart-item-qty">
                {{ item.qty }}
              </div>
              <button class="qty-btn" @click="changeQty(item._itemKey, 1)">
                +
              </button>
            </div>
          </div>
        </div>

        <div class="cart-footer">
          <div class="checkout-row">
            <span style="color: var(--muted)">商品数量</span>
            <span style="font-weight: 600">{{ cartTotalQty }} 件</span>
          </div>
          <div class="checkout-row total">
            <span>合计金额</span>
            <span class="checkout-price font-display">¥{{ formatNumber(cartTotalPrice) }}</span>
          </div>

          <!-- 支付方式选择 -->
          <div class="payment-methods">
            <div class="payment-methods-label">
              选择支付方式
            </div>
            <div
              class="payment-options"
              :style="{
                '--payment-method-grid': payMethods.length > 1 ? 2 : 1,
              }"
            >
              <div
                v-for="item in payMethods"
                :key="item.value"
                class="payment-option"
                :class="{ active: selectedPaymentMethod === item.value }"
                @click="selectedPaymentMethod = item.value"
              >
                <span class="payment-icon" :style="{ color: item.color }" :class="item.icon" />
                <span>{{ item.label }}</span>
              </div>
            </div>
          </div>

          <button class="btn-checkout" :disabled="submitDisabled" @click="handleSubmit">
            <svg v-if="false" style="width: 24px; height: 24px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            确认结账
          </button>
          <div class="payment-hint">
            <!-- 支持微信、支付宝、银行卡支付 -->
          </div>
        </div>
      </div>
    </div>

    <RetailPayInfo ref="retailPayInfoRef" />
  </div>
</template>

<style scoped lang="scss">
.retail-page {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;

  --bg: #f8fafc;
  --bg-secondary: #ffffff;
  --card: #ffffff;
  --border: #e2e8f0;
  --fg: #0f172a;
  --fg-secondary: #334155;
  --muted: #64748b;
  --accent: var(--v-color-primary);
  --accent-light: var(--v-color-secondary);
  --accent-glow: rgba(0, 53, 148, 0.15);
  --accent-soft: #e0e9f7;
  --warning: #ea580c;
  --danger: #dc2626;
  --success: var(--v-color-success);
}

.page-container {
  flex: 1;
  display: flex;
  height: 100%;
  width: 100%;
  overflow: auto;
  gap: 24px;
  padding-top: 20px;
  padding-left: 10px;
  padding-right: 10px;
  padding-bottom: 10px;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.cart-panel {
  flex: 1;
  flex-shrink: 0;
  max-width: 400px;
  background: #ffffff;
  border-left: 2px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.04);
  height: 100%;

}

/* --- 搜索栏 --- */
.search-bar {
  display: flex;
  gap: 16px;
  margin-bottom: 14px;
}

.search-input-wrapper {
  flex: 1;
  position: relative;
}

.search-icon {
  position: absolute;
  left: 20px;
  top: 50%;
  transform: translateY(-50%);
  width: 20px;
  height: 20px;
  color: var(--muted);
}

.search-input {
  width: 100%;
  background: white;
  border: 2px solid var(--border);
  border-radius: 16px;
  padding: 16px 20px 16px 52px;
  font-size: 16px;
  transition: all 0.2s;
}

.search-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 4px var(--accent-glow);
}

.btn-help {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 24px;
  background: white;
  border: 2px solid var(--border);
  border-radius: 16px;
  font-size: 16px;
  font-weight: 600;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.2s;
}

.btn-help:hover {
  border-color: var(--accent);
  color: var(--fg);
}

.btn-help svg {
  width: 20px;
  height: 20px;
}

/* --- 分类标签 --- */
.category-wrapper {
  position: relative;
  margin-bottom: 12px;
}

.category-tabs {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 8px;
}

.category-btn {
  padding: 12px 24px;
  background: white;
  border: 2px solid var(--border);
  border-radius: 12px;
  font-size: 16px;
  font-weight: 600;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
  flex-shrink: 0;
}

.category-btn:hover {
  border-color: var(--accent);
  color: var(--fg);
}

.category-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
  box-shadow: 0 4px 12px var(--accent-glow);
}

/* --- 商品网格 --- */
.product-grid-container {
  flex: 1;
  overflow-y: auto;
  padding-right: 8px;
  padding-top: 8px;
}

.product-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 20px;
}

/* --- 商品卡片 --- */
.product-card {
  background: white;
  border: 2px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  cursor: pointer;
  transition: all 0.25s;
  position: relative;
  display: flex;
  flex-direction: column;
}

.product-card:hover {
  border-color: var(--accent);
  transform: translateY(-4px);
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.08);
}

.product-image::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(45deg, transparent 40%, rgba(255, 255, 255, 0.8) 50%, transparent 60%);
  transform: translateX(-100%);
  transition: transform 0.5s;
}

.product-card:hover .product-image::before {
  transform: translateX(100%);
}

.product-card:active {
  transform: translateY(0);
}

.product-image {
  width: 100%;
  aspect-ratio: 1;
  background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
  border-radius: 12px;
  margin-bottom: 12px;
  position: relative;
  overflow: hidden;
  display: flex;
  justify-content: center;
  align-items: center;
}

.product-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  /* 保持比例裁剪 */
  display: block;
}

.product-tag {
  position: absolute;
  top: 8px;
  left: 8px;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  z-index: 2;
}

.tag-hot {
  background: #fef3c7;
  color: #b45309;
}

.tag-new {
  background: var(--accent-soft);
  color: var(--accent);
}

.product-name {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.product-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: auto;
}

.product-price {
  font-size: 18px;
  font-weight: 700;
  color: var(--accent);
}

.product-hint {
  font-size: 12px;
  color: var(--muted);
  background: #f1f5f9;
  padding: 4px 8px;
  border-radius: 6px;
}

/* --- 购物车头部 --- */
.cart-header {
  padding: 24px;
  border-bottom: 2px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.cart-title {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 20px;
  font-weight: 700;
}

.cart-icon-wrapper {
  position: relative;
  width: 28px;
  height: 28px;
}

.cart-icon-wrapper svg {
  width: 28px;
  height: 28px;
  color: var(--accent);
}

.cart-badge {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 20px;
  height: 20px;
  background: var(--warning);
  color: white;
  border-radius: 50%;
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid white;
}

.btn-clear {
  font-size: 14px;
  font-weight: 600;
  color: var(--muted);
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: all 0.2s;
}

.btn-clear:hover {
  color: var(--danger);
  background: #fef2f2;
}

/* --- 购物车列表 --- */
.cart-list {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.cart-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  color: var(--muted);
}

.cart-empty svg {
  width: 64px;
  height: 64px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.cart-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 12px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 12px;
  margin-bottom: 12px;
}

.cart-item-img {
  width: 68px;
  height: 68px;
  background: white;
  border: 1px solid var(--border);
  border-radius: 8px;
  flex-shrink: 0;
  overflow: hidden;
  display: flex;
  justify-content: center;
  align-items: center;
}

.cart-item-img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cart-item-info {
  flex: 1;
  min-width: 0;
}

.cart-item-name {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cart-item-price {
  font-size: 16px;
  font-weight: 700;
  color: var(--accent);
}

.cart-item-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.qty-btn {
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--border);
  border-radius: 8px;
  background: white;
  font-size: 18px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.qty-btn:hover {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
}

.cart-item-qty {
  width: 26px;
  text-align: center;
  font-weight: 700;
}

/* --- 结账区域 --- */
.cart-footer {
  padding: 24px;
  border-top: 2px solid var(--border);
  background: white;
  margin-top: auto;
}

.checkout-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
  font-size: 15px;
}

.checkout-row.total {
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 24px;
}

.checkout-price {
  font-family: 'Outfit', sans-serif;
  font-size: 28px;
  font-weight: 800;
  color: var(--accent);
}

.btn-checkout {
  width: 100%;
  padding: 20px;
  background: var(--accent);
  color: white;
  border: none;
  border-radius: 16px;
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.btn-checkout:hover:not(:disabled) {
  background: var(--accent-light);
  transform: translateY(-2px);
  box-shadow: 0 8px 16px var(--accent-glow);
}

.btn-checkout:disabled {
  background: #cbd5e1;
  cursor: not-allowed;
}

.payment-hint {
  text-align: center;
  font-size: 12px;
  color: var(--muted);
  margin-top: 16px;
}

/* 动画 */
@keyframes slideIn {
  from {
    transform: translateY(20px);
    opacity: 0;
  }

  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.modal-animate {
  animation: slideIn 0.3s ease-out;
}

.badge-animate {
  animation: bounce 0.3s ease-out;
}

/* Payment Method Selector */
.payment-methods {
  margin-bottom: 20px;
}

.payment-methods-label {
  font-size: 14px;
  color: var(--muted);
  margin-bottom: 12px;
  font-weight: 500;
}

.payment-options {
  display: grid;
  grid-template-columns: repeat(var(--payment-method-grid, 3), 1fr);
  gap: 12px;
}

.payment-option {
  border: 2px solid var(--border);
  border-radius: 12px;
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  transition: all 0.2s;
  background: white;
}

.payment-icon {
  width: 40px;
  height: 40px;
}

.payment-option:hover {
  border-color: var(--accent);
}

.payment-option.active {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.payment-option span {
  font-size: 14px;
  font-weight: 600;
  color: var(--fg-secondary);
}

.payment-option.active span {
  color: var(--accent);
}

/* 飞入动画元素 */
:deep(.fly-ball) {
  position: absolute;
  width: 40px;
  height: 40px;
  background-color: var(--accent);
  /* 备用背景色 */
  border-radius: 50%;
  pointer-events: none;
  z-index: 200;
  /* 背景图片设置 */
  background-size: cover;
  background-position: center;
  animation: flyUp 0.6s ease-out forwards;
  border: 2px solid white;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
}

@keyframes bounce {
  0% {
    transform: scale(1);
  }

  50% {
    transform: scale(1.2);
  }

  100% {
    transform: scale(1);
  }
}

@keyframes flyUp {
  0% {
    opacity: 1;
    transform: scale(1);
  }

  100% {
    opacity: 0;
    transform: scale(0.5) translateY(-100px);
  }
}
</style>
