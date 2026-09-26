<script setup lang="ts">
import type { DevicePrintTicket, FhOrder, FhQuery } from '@desktop/shared'
import QRCode from 'qrcode'
import { computed, onBeforeUnmount, ref } from 'vue'
import { useScanner } from '../composables/use-scanner'
import NumPad from './NumPad.vue'

const emit = defineEmits<{ back: [] }>()

const state = ref<'identify' | 'orders' | 'paying' | 'done'>('identify')
const orders = ref<FhOrder[]>([])
const emptyTip = ref('')
const numpadVisible = ref(false)
const reading = ref(false)

// ---- 支付状态 ----
const payingOrder = ref<FhOrder | null>(null)
const qrDataUrl = ref('')
const payStatusText = ref('等待扫码支付')
let pollTimer: ReturnType<typeof setInterval> | null = null

// ---- 完成态 ----
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
  const result = await window.desktop.funeral.queryOrders(query)
  if (result.length === 0) {
    emptyTip.value = query.code
      ? `未查询到业务单 ${query.code}，请核对条码或到服务台处理`
      : '该证件名下暂无待办理业务，请到服务台核实'
    return
  }
  orders.value = result
  state.value = 'orders'
}

const unpaidOrders = computed(() => orders.value.filter(order => order.status === 'unpaid'))
const paidOrders = computed(() => orders.value.filter(order => order.status === 'paid'))

async function startPay(order: FhOrder): Promise<void> {
  payingOrder.value = order
  const session = await window.desktop.funeral.createPay(order.orderNo)
  qrDataUrl.value = await QRCode.toDataURL(session.qrContent, { width: 300, margin: 1 })
  payStatusText.value = '等待扫码支付'
  state.value = 'paying'
  pollTimer = setInterval(async () => {
    const status = await window.desktop.funeral.payStatus(order.orderNo)
    if (status === 'paid') {
      order.status = 'paid'
      stopPoll()
      payStatusText.value = ''
      state.value = 'done'
    }
  }, 2000)
}

function stopPoll(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function cancelPay(): void {
  stopPoll()
  state.value = 'orders'
}

async function printReceipt(): Promise<void> {
  if (!payingOrder.value || printState.value !== 'idle')
    return
  printState.value = 'printing'
  const ticket: DevicePrintTicket = {
    title: '缴费凭条',
    lines: [
      `业务单号 ${payingOrder.value.orderNo}`,
      `缴费金额 ￥${payingOrder.value.amount.toFixed(2)}`,
      `支付时间 ${new Date().toLocaleString('zh-CN', { hour12: false })}`,
      '请妥善保管凭条',
    ],
  }
  await window.desktop.device.print(ticket)
  printState.value = 'done'
}

function reset(): void {
  stopPoll()
  state.value = 'identify'
  orders.value = []
  emptyTip.value = ''
  payingOrder.value = null
  qrDataUrl.value = ''
  printState.value = 'idle'
}

defineExpose({ reset })
onBeforeUnmount(stopPoll)
</script>

<template>
  <div class="fp-page">
    <div class="fp-head">
      <h2 class="fp-title">
        业务缴费
      </h2>
      <button class="fk-btn-ghost" @click="emit('back')">
        返回首页
      </button>
    </div>

    <!-- 识别：扫码 / 读卡 / 手动输入 -->
    <template v-if="state === 'identify'">
      <div class="fp-identify">
        <div class="fp-identify__hint">
          请扫描业务办理单条码，或使用身份证查询
        </div>
        <div class="fp-identify__actions">
          <button class="fk-btn-primary fp-identify__btn" @click="readCard">
            {{ reading ? '读卡中…' : '身份证读卡' }}
          </button>
          <button class="fk-btn-ghost fp-identify__btn" @click="numpadVisible = true">
            手动输入身份证
          </button>
        </div>
        <div v-if="emptyTip" class="fp-identify__empty">
          {{ emptyTip }}
        </div>
      </div>
      <Teleport to="body">
        <div v-if="numpadVisible" class="fp-numpad-mask" @click.self="numpadVisible = false">
          <NumPad
            @confirm="onNumpadConfirm"
            @close="numpadVisible = false"
          />
        </div>
      </Teleport>
    </template>

    <!-- 业务单列表 -->
    <template v-else-if="state === 'orders'">
      <div class="fp-list">
        <div v-for="order in unpaidOrders" :key="order.orderNo" class="fp-row">
          <div class="fp-row__info">
            <div class="fp-row__name">
              {{ order.deceasedName }} · 业务单 {{ order.orderNo }}
            </div>
            <div class="fp-row__meta">
              {{ order.items.join(' / ') }}
            </div>
          </div>
          <div class="fp-row__amount">
            ￥{{ order.amount.toFixed(2) }}
          </div>
          <button class="fk-btn-primary fp-row__btn" @click="startPay(order)">
            缴费
          </button>
        </div>
        <div v-if="paidOrders.length" class="fp-paid">
          <div class="fp-paid__label">
            已缴业务
          </div>
          <div v-for="order in paidOrders" :key="order.orderNo" class="fp-row fp-row--paid">
            <div class="fp-row__info">
              <div class="fp-row__name">
                {{ order.deceasedName }} · 业务单 {{ order.orderNo }}
              </div>
              <div class="fp-row__meta">
                {{ order.items.join(' / ') }}
              </div>
            </div>
            <div class="fp-row__amount">
              ￥{{ order.amount.toFixed(2) }}
            </div>
            <span class="fp-row__tag">已缴费</span>
          </div>
        </div>
        <button class="fk-btn-ghost fp-again" @click="reset">
          返回重新识别
        </button>
      </div>
    </template>

    <!-- 支付 -->
    <template v-else-if="state === 'paying' && payingOrder">
      <div class="fp-paying">
        <div class="fp-paying__order">
          {{ payingOrder.deceasedName }} · 业务单 {{ payingOrder.orderNo }}
        </div>
        <div class="fp-paying__amount">
          ￥{{ payingOrder.amount.toFixed(2) }}
        </div>
        <img v-if="qrDataUrl" class="fp-paying__qr" :src="qrDataUrl" alt="支付二维码">
        <div class="fp-paying__hint">
          {{ payStatusText }} · 请使用微信或支付宝扫码
        </div>
        <button class="fk-btn-ghost fp-paying__cancel" @click="cancelPay">
          暂不支付
        </button>
      </div>
    </template>

    <!-- 完成 -->
    <template v-else-if="state === 'done' && payingOrder">
      <div class="fp-done">
        <div class="fp-done__title">
          缴费成功
        </div>
        <div class="fp-done__amount">
          ￥{{ payingOrder.amount.toFixed(2) }}
        </div>
        <div class="fp-done__meta">
          业务单 {{ payingOrder.orderNo }}
        </div>
        <div class="fp-done__actions">
          <button
            class="fk-btn-primary"
            :disabled="printState !== 'idle'"
            @click="printReceipt"
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
.fp-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.fp-head {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}
.fp-title {
  font-size: 26px;
  font-weight: 600;
  margin: 0;
}
.fp-identify,
.fp-paying,
.fp-done {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #ffffff;
  border: 1px solid #e3e0db;
  border-radius: 14px;
}
.fp-identify__hint {
  font-size: 24px;
  color: #2b3540;
}
.fp-identify__actions {
  display: flex;
  margin-top: 36px;
}
.fp-identify__btn {
  height: 64px;
  padding: 0 48px;
  font-size: 22px;
  border-radius: 12px;
}
.fp-identify__btn + .fp-identify__btn {
  margin-left: 20px;
}
.fp-identify__empty {
  font-size: 16px;
  color: #b0483a;
  margin-top: 28px;
}
.fp-numpad-mask {
  position: fixed;
  inset: 0;
  background: rgba(43, 53, 64, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}
.fp-list {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}
.fp-row {
  flex: none;
  display: flex;
  align-items: center;
  border: 1px solid #e3e0db;
  border-radius: 12px;
  background: #ffffff;
  padding: 22px 32px;
  margin-bottom: 14px;
}
.fp-row--paid {
  background: #fafaf8;
}
.fp-row__info {
  flex: 1;
  min-width: 0;
}
.fp-row__name {
  font-size: 20px;
  font-weight: 600;
  color: #2b3540;
}
.fp-row__meta {
  font-size: 15px;
  color: #6b7684;
  margin-top: 6px;
}
.fp-row__amount {
  font-size: 24px;
  font-weight: 600;
  color: #2b3540;
  margin: 0 28px;
}
.fp-row__btn {
  height: 48px;
  padding: 0 36px;
  font-size: 18px;
  border-radius: 10px;
}
.fp-row__tag {
  font-size: 16px;
  color: #9aa2ac;
}
.fp-paid {
  margin-top: 8px;
}
.fp-paid__label {
  font-size: 16px;
  color: #9aa2ac;
  margin-bottom: 12px;
}
.fp-again {
  align-self: flex-start;
  height: 52px;
  padding: 0 32px;
  font-size: 18px;
  border-radius: 10px;
  margin-top: 6px;
}
.fp-paying__order {
  font-size: 18px;
  color: #6b7684;
}
.fp-paying__amount {
  font-size: 56px;
  font-weight: 700;
  color: #2b3540;
  margin: 14px 0 24px;
}
.fp-paying__qr {
  width: 300px;
  height: 300px;
  border: 1px solid #e3e0db;
  border-radius: 12px;
}
.fp-paying__hint {
  font-size: 18px;
  color: #2b3540;
  margin-top: 24px;
}
.fp-paying__cancel {
  height: 52px;
  padding: 0 40px;
  font-size: 18px;
  border-radius: 10px;
  margin-top: 20px;
}
.fp-done__title {
  font-size: 28px;
  color: #2b3540;
}
.fp-done__amount {
  font-size: 64px;
  font-weight: 700;
  color: #3a4a5a;
  margin: 14px 0 8px;
}
.fp-done__meta {
  font-size: 17px;
  color: #6b7684;
}
.fp-done__actions {
  display: flex;
  margin-top: 36px;
}
.fp-done__actions > button {
  height: 56px;
  padding: 0 40px;
  font-size: 20px;
  border-radius: 12px;
}
.fp-done__actions > button + button {
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
