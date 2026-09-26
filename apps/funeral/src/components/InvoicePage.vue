<script setup lang="ts">
import type { DevicePrintTicket, FhInvoice, FhInvoiceTitle, FhOrder, FhQuery } from '@desktop/shared'
import { computed, ref } from 'vue'
import { useScanner } from '../composables/use-scanner'
import NumPad from './NumPad.vue'

const emit = defineEmits<{ back: [] }>()

const state = ref<'identify' | 'list' | 'form' | 'done'>('identify')
const tab = ref<'pending' | 'issued'>('pending')
const orders = ref<FhOrder[]>([])
const invoices = ref<FhInvoice[]>([])
const emptyTip = ref('')
const numpadVisible = ref(false)
const reading = ref(false)

// ---- 开票表单 ----
const formOrder = ref<FhOrder | null>(null)
const titleType = ref<'person' | 'company'>('person')
const titleName = ref('')
const taxId = ref('')
const email = ref('')
const submitting = ref(false)

// ---- 完成 ----
const issued = ref<FhInvoice | null>(null)
const printState = ref<'idle' | 'printing' | 'done'>('idle')

// 扫码枪：业务单条码（HID 键盘流）
useScanner({
  onScan: (code) => {
    if (reading.value || numpadVisible.value || state.value !== 'identify')
      return
    void identify({ code })
  },
})

async function readCard(): Promise<void> {
  if (reading.value || state.value !== 'identify')
    return
  reading.value = true
  try {
    const card = await window.desktop.device.readIdCard()
    if (card)
      await identify({ idNumber: card.idNumber })
  }
  finally {
    reading.value = false
  }
}

function onNumpadConfirm(idNumber: string): void {
  numpadVisible.value = false
  void identify({ idNumber })
}

async function identify(query: FhQuery): Promise<void> {
  const [orderList, invoiceList] = await Promise.all([
    window.desktop.funeral.queryOrders(query),
    window.desktop.funeral.listInvoices(query),
  ])
  if (orderList.length === 0 && invoiceList.length === 0) {
    emptyTip.value = '该凭据下暂无业务记录，请核对后重试或到服务台处理'
    return
  }
  orders.value = orderList
  invoices.value = invoiceList
  tab.value = orderList.some(order => order.status === 'paid' && !order.invoiced)
    ? 'pending'
    : 'issued'
  state.value = 'list'
}

// 可开票：已缴费且未开票
const pendingOrders = computed(() =>
  orders.value.filter(order => order.status === 'paid' && !order.invoiced))

function openForm(order: FhOrder): void {
  formOrder.value = order
  titleType.value = 'person'
  titleName.value = ''
  taxId.value = ''
  email.value = ''
  state.value = 'form'
}

async function submit(): Promise<void> {
  if (!formOrder.value || submitting.value)
    return
  if (!titleName.value.trim()) {
    emptyTip.value = '请填写抬头名称'
    return
  }
  if (titleType.value === 'company' && !taxId.value.trim()) {
    emptyTip.value = '单位抬头需填写纳税人识别号'
    return
  }
  submitting.value = true
  try {
    const title: FhInvoiceTitle = {
      type: titleType.value,
      name: titleName.value.trim(),
      ...(titleType.value === 'company' ? { taxId: taxId.value.trim() } : {}),
      ...(email.value.trim() ? { email: email.value.trim() } : {}),
    }
    issued.value = await window.desktop.funeral.issueInvoice({
      orderNo: formOrder.value.orderNo,
      title,
    })
    formOrder.value.invoiced = true
    state.value = 'done'
  }
  finally {
    submitting.value = false
  }
}

async function printInvoice(invoice: FhInvoice | null): Promise<void> {
  const target = invoice ?? issued.value
  if (!target || printState.value !== 'idle')
    return
  printState.value = 'printing'
  const ticket: DevicePrintTicket = {
    title: '发票信息凭条',
    lines: [
      `发票号码 ${target.invoiceNo}`,
      `抬头 ${target.title.name}`,
      `金额 ￥${target.amount.toFixed(2)}`,
      `开票时间 ${target.issuedAt}`,
      target.title.email ? `电子票已发送至 ${target.title.email}` : '请妥善保管',
    ],
  }
  await window.desktop.device.print(ticket)
  printState.value = 'done'
}

function reset(): void {
  state.value = 'identify'
  orders.value = []
  invoices.value = []
  emptyTip.value = ''
  issued.value = null
  printState.value = 'idle'
}
</script>

<template>
  <div class="fi-page">
    <div class="fi-head">
      <h2 class="fi-title">
        发票服务
      </h2>
      <button class="fk-btn-ghost" @click="emit('back')">
        返回首页
      </button>
    </div>

    <!-- 识别 -->
    <template v-if="state === 'identify'">
      <div class="fi-identify">
        <div class="fi-identify__hint">
          请扫描业务办理单条码，或使用身份证查询
        </div>
        <div class="fi-identify__actions">
          <button class="fk-btn-primary fi-identify__btn" @click="readCard">
            {{ reading ? '读卡中…' : '身份证读卡' }}
          </button>
          <button class="fk-btn-ghost fi-identify__btn" @click="numpadVisible = true">
            手动输入身份证
          </button>
        </div>
        <div v-if="emptyTip" class="fi-identify__empty">
          {{ emptyTip }}
        </div>
      </div>
      <Teleport to="body">
        <div v-if="numpadVisible" class="fi-numpad-mask" @click.self="numpadVisible = false">
          <NumPad @confirm="onNumpadConfirm" @close="numpadVisible = false" />
        </div>
      </Teleport>
    </template>

    <!-- 列表：待开票 / 已开票 -->
    <template v-else-if="state === 'list'">
      <div class="fi-tabs">
        <button
          class="fi-tab"
          :class="{ 'is-active': tab === 'pending' }"
          @click="tab = 'pending'"
        >
          待开票
        </button>
        <button
          class="fi-tab"
          :class="{ 'is-active': tab === 'issued' }"
          @click="tab = 'issued'"
        >
          已开票
        </button>
        <button class="fk-btn-ghost fi-tabs__back" @click="reset">
          返回重新识别
        </button>
      </div>

      <div v-if="tab === 'pending'" class="fi-list">
        <div v-for="order in pendingOrders" :key="order.orderNo" class="fi-row">
          <div class="fi-row__info">
            <div class="fi-row__name">
              {{ order.deceasedName }} · 业务单 {{ order.orderNo }}
            </div>
            <div class="fi-row__meta">
              {{ order.items.join(' / ') }}
            </div>
          </div>
          <div class="fi-row__amount">
            ￥{{ order.amount.toFixed(2) }}
          </div>
          <button class="fk-btn-primary fi-row__btn" @click="openForm(order)">
            去开票
          </button>
        </div>
        <div v-if="pendingOrders.length === 0" class="fi-list__empty">
          暂无可开票业务（已缴费且未开票的业务可开票）
        </div>
      </div>

      <div v-else class="fi-list">
        <div v-for="invoice in invoices" :key="invoice.invoiceNo" class="fi-row">
          <div class="fi-row__info">
            <div class="fi-row__name">
              发票号 {{ invoice.invoiceNo }}
            </div>
            <div class="fi-row__meta">
              抬头 {{ invoice.title.name }} · {{ invoice.issuedAt }}
            </div>
          </div>
          <div class="fi-row__amount">
            ￥{{ invoice.amount.toFixed(2) }}
          </div>
          <button class="fk-btn-ghost fi-row__btn" @click="printInvoice(invoice)">
            打印凭条
          </button>
        </div>
        <div v-if="invoices.length === 0" class="fi-list__empty">
          暂无已开发票
        </div>
      </div>
    </template>

    <!-- 开票表单 -->
    <template v-else-if="state === 'form' && formOrder">
      <div class="fi-form">
        <div class="fi-form__order">
          {{ formOrder.deceasedName }} · 业务单 {{ formOrder.orderNo }} · ￥{{ formOrder.amount.toFixed(2) }}
        </div>
        <div class="fi-form__row">
          <span class="fi-form__label">抬头类型</span>
          <button
            class="fi-form__seg"
            :class="{ 'is-active': titleType === 'person' }"
            @click="titleType = 'person'"
          >
            个人
          </button>
          <button
            class="fi-form__seg"
            :class="{ 'is-active': titleType === 'company' }"
            @click="titleType = 'company'"
          >
            企业单位
          </button>
        </div>
        <div class="fi-form__row">
          <span class="fi-form__label">{{ titleType === 'person' ? '姓名' : '单位名称' }}</span>
          <!-- 真实部署：自助机需配中文软键盘，或以读卡自动填充个人抬头为主路径 -->
          <input v-model="titleName" class="fi-form__input" type="text">
        </div>
        <div v-if="titleType === 'company'" class="fi-form__row">
          <span class="fi-form__label">纳税人识别号</span>
          <input v-model="taxId" class="fi-form__input" type="text">
        </div>
        <div class="fi-form__row">
          <span class="fi-form__label">电子票邮箱</span>
          <input v-model="email" class="fi-form__input" type="text" placeholder="选填">
        </div>
        <div v-if="emptyTip" class="fi-form__error">
          {{ emptyTip }}
        </div>
        <div class="fi-form__actions">
          <button
            class="fk-btn-primary"
            :disabled="submitting"
            @click="submit"
          >
            {{ submitting ? '开票中…' : '提交开票' }}
          </button>
          <button class="fk-btn-ghost" @click="state = 'list'">
            返回
          </button>
        </div>
      </div>
    </template>

    <!-- 完成 -->
    <template v-else-if="state === 'done' && issued">
      <div class="fi-done">
        <div class="fi-done__title">
          开票成功
        </div>
        <div class="fi-done__no">
          {{ issued.invoiceNo }}
        </div>
        <div class="fi-done__meta">
          抬头 {{ issued.title.name }} · ￥{{ issued.amount.toFixed(2) }}
        </div>
        <div class="fi-done__actions">
          <button
            class="fk-btn-primary"
            :disabled="printState !== 'idle'"
            @click="printInvoice(null)"
          >
            {{ printState === 'idle' ? '打印凭条' : printState === 'printing' ? '打印中…' : '已打印' }}
          </button>
          <button class="fk-btn-ghost" @click="reset">
            继续办理
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.fi-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.fi-head {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}
.fi-title {
  font-size: 26px;
  font-weight: 600;
  margin: 0;
}
.fi-identify,
.fi-form,
.fi-done {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #ffffff;
  border: 1px solid #e3e0db;
  border-radius: 14px;
}
.fi-identify__hint {
  font-size: 24px;
  color: #2b3540;
}
.fi-identify__actions {
  display: flex;
  margin-top: 36px;
}
.fi-identify__btn {
  height: 64px;
  padding: 0 48px;
  font-size: 22px;
  border-radius: 12px;
}
.fi-identify__btn + .fi-identify__btn {
  margin-left: 20px;
}
.fi-identify__empty {
  font-size: 16px;
  color: #b0483a;
  margin-top: 28px;
}
.fi-numpad-mask {
  position: fixed;
  inset: 0;
  background: rgba(43, 53, 64, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}
.fi-tabs {
  flex: none;
  display: flex;
  align-items: center;
  margin-bottom: 18px;
}
.fi-tab {
  height: 48px;
  padding: 0 32px;
  border: 1px solid #d9d5cf;
  border-radius: 10px;
  background: #ffffff;
  color: #6b7684;
  font-size: 18px;
  cursor: pointer;
  font-family: inherit;
}
.fi-tab.is-active {
  background: #3a4a5a;
  border-color: #3a4a5a;
  color: #ffffff;
}
.fi-tabs__back {
  margin-left: auto;
  height: 48px;
  padding: 0 28px;
  font-size: 16px;
  border-radius: 10px;
}
.fi-list {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}
.fi-row {
  flex: none;
  display: flex;
  align-items: center;
  border: 1px solid #e3e0db;
  border-radius: 12px;
  background: #ffffff;
  padding: 22px 32px;
  margin-bottom: 14px;
}
.fi-row__info {
  flex: 1;
  min-width: 0;
}
.fi-row__name {
  font-size: 20px;
  font-weight: 600;
  color: #2b3540;
}
.fi-row__meta {
  font-size: 15px;
  color: #6b7684;
  margin-top: 6px;
}
.fi-row__amount {
  font-size: 24px;
  font-weight: 600;
  color: #2b3540;
  margin: 0 28px;
}
.fi-row__btn {
  height: 48px;
  padding: 0 36px;
  font-size: 18px;
  border-radius: 10px;
}
.fi-list__empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  color: #9aa2ac;
}
.fi-form__order {
  font-size: 18px;
  color: #6b7684;
  margin-bottom: 28px;
}
.fi-form__row {
  display: flex;
  align-items: center;
  margin-bottom: 18px;
}
.fi-form__label {
  width: 140px;
  text-align: right;
  margin-right: 16px;
  font-size: 17px;
  color: #2b3540;
}
.fi-form__seg {
  height: 48px;
  padding: 0 32px;
  border: 1px solid #d9d5cf;
  background: #fafaf8;
  color: #6b7684;
  font-size: 17px;
  cursor: pointer;
  font-family: inherit;
}
.fi-form__seg:first-of-type {
  border-radius: 10px 0 0 10px;
}
.fi-form__seg + .fi-form__seg {
  border-left: none;
  border-radius: 0 10px 10px 0;
}
.fi-form__seg.is-active {
  background: #3a4a5a;
  border-color: #3a4a5a;
  color: #ffffff;
}
.fi-form__input {
  width: 420px;
  height: 48px;
  border: 1px solid #d9d5cf;
  border-radius: 10px;
  background: #fafaf8;
  padding: 0 16px;
  font-size: 17px;
  color: #2b3540;
  outline: none;
}
.fi-form__input:focus {
  border-color: #3a4a5a;
}
.fi-form__error {
  font-size: 15px;
  color: #b0483a;
  margin-top: 4px;
}
.fi-form__actions {
  display: flex;
  margin-top: 22px;
}
.fi-form__actions > button {
  height: 54px;
  padding: 0 40px;
  font-size: 19px;
  border-radius: 12px;
}
.fi-form__actions > button + button {
  margin-left: 16px;
}
.fi-done__title {
  font-size: 28px;
  color: #2b3540;
}
.fi-done__no {
  font-size: 40px;
  font-weight: 700;
  color: #3a4a5a;
  letter-spacing: 2px;
  margin: 14px 0 8px;
  font-family: 'Consolas', monospace;
}
.fi-done__meta {
  font-size: 17px;
  color: #6b7684;
}
.fi-done__actions {
  display: flex;
  margin-top: 36px;
}
.fi-done__actions > button {
  height: 56px;
  padding: 0 40px;
  font-size: 20px;
  border-radius: 12px;
}
.fi-done__actions > button + button {
  margin-left: 16px;
}

.fk-btn-ghost,
.fk-btn-primary {
  cursor: pointer;
  font-family: inherit;
}
.fk-btn-ghost {
  border: 1px solid #d9d5cf;
  background: #ffffff;
  color: #2b3540;
}
.fk-btn-ghost:hover {
  background: #f2f0ec;
}
.fk-btn-primary {
  border: none;
  background: #3a4a5a;
  color: #ffffff;
}
.fk-btn-primary:hover {
  background: #2e3b48;
}
.fk-btn-primary:disabled {
  background: #8b97a3;
  cursor: default;
}
</style>
