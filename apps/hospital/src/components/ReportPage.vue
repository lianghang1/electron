<script setup lang="ts">
import type { DeviceIdCard, DevicePrintTicket } from '@desktop/shared'
import { computed, ref } from 'vue'
import { useScanner } from '../composables/use-scanner'

const emit = defineEmits<{ back: [] }>()

interface Report {
  id: string
  type: string
  name: string
  date: string
}

const state = ref<'identify' | 'list'>('identify')
const patient = ref<DeviceIdCard | null>(null)
const reports = ref<Report[]>([])
const printingId = ref('')
const printedIds = ref<string[]>([])

// 扫码枪：USB HID 键盘流，扫报告条码直接进入报告列表
useScanner({ onScan: () => identify() })

async function readCard(): Promise<void> {
  const card = await window.desktop.device.readIdCard()
  identify(card ?? undefined)
}

function identify(card?: DeviceIdCard): void {
  if (state.value === 'list')
    return
  patient.value = card ?? null
  // mock：真实部署替换为 HIS 报告查询接口（按卡号/条码查询）
  reports.value = [
    { id: 'LAB-20260924-001', type: '检验报告', name: '血常规五分类', date: '2026-09-24' },
    { id: 'RAD-20260924-017', type: '检查报告', name: '胸部正位 DR', date: '2026-09-24' },
  ]
  state.value = 'list'
}

const maskedId = computed(() =>
  patient.value ? patient.value.idNumber.replace(/^(.{3}).+(.{3})$/, '$1***********$2') : '')

async function printReport(report: Report): Promise<void> {
  if (printingId.value)
    return
  printingId.value = report.id
  const ticket: DevicePrintTicket = {
    title: '检验检查报告',
    lines: [
      `${report.type} ${report.name}`,
      `报告编号 ${report.id}`,
      `患者 ${patient.value?.name ?? '自助打印'}`,
      `报告日期 ${report.date}`,
    ],
  }
  await window.desktop.device.print(ticket)
  printingId.value = ''
  printedIds.value = [...printedIds.value, report.id]
}
</script>

<template>
  <div class="hp-page">
    <template v-if="state === 'identify'">
      <div class="hp-head">
        <h2 class="hp-title">
          报告打印
        </h2>
        <button class="hs-btn-back" @click="emit('back')">
          返回首页
        </button>
      </div>
      <div class="hp-identify">
        <div class="hp-identify__hint">
          请将身份证放置读卡区，或扫描报告条码
        </div>
        <button class="hs-btn-primary hp-identify__read" @click="readCard">
          身份证读卡
        </button>
      </div>
    </template>

    <template v-else>
      <div class="hp-head">
        <h2 class="hp-title">
          可打印报告
          <span v-if="patient" class="hp-patient">{{ patient.name }}（{{ maskedId }}）</span>
        </h2>
        <button class="hs-btn-back" @click="emit('back')">
          返回首页
        </button>
      </div>
      <div class="hp-list">
        <div v-for="report in reports" :key="report.id" class="hp-row">
          <div class="hp-row__info">
            <span class="hp-row__name">{{ report.name }}</span>
            <span class="hp-row__meta">{{ report.type }} · {{ report.date }} · {{ report.id }}</span>
          </div>
          <button
            class="hs-btn-primary hp-row__print"
            :disabled="printingId === report.id"
            @click="printReport(report)"
          >
            {{ printedIds.includes(report.id) ? '已打印' : printingId === report.id ? '打印中…' : '打印报告' }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.hp-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.hp-head {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}
.hp-title {
  font-size: 26px;
  font-weight: 600;
  margin: 0;
  display: flex;
  align-items: baseline;
}
.hp-patient {
  font-size: 16px;
  font-weight: 400;
  color: #6c86a3;
  margin-left: 16px;
}
.hp-identify {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #ffffff;
  border: 1px solid #d8e4f2;
  border-radius: 14px;
}
.hp-identify__hint {
  font-size: 24px;
  color: #17334f;
}
.hp-identify__read {
  margin-top: 36px;
  height: 64px;
  padding: 0 56px;
  font-size: 22px;
  border-radius: 12px;
}
.hp-list {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.hp-row {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 1px solid #d8e4f2;
  border-radius: 12px;
  background: #ffffff;
  padding: 0 36px;
  margin-bottom: 14px;
}
.hp-row:last-child {
  margin-bottom: 0;
}
.hp-row__info {
  display: flex;
  flex-direction: column;
}
.hp-row__name {
  font-size: 22px;
  font-weight: 600;
  color: #17334f;
}
.hp-row__meta {
  font-size: 15px;
  color: #8fa6bf;
  margin-top: 6px;
}
.hp-row__print {
  height: 48px;
  padding: 0 32px;
  font-size: 18px;
  border-radius: 10px;
}
.hp-row__print:disabled {
  background: #7ba7d9;
  cursor: default;
}

.hs-btn-back,
.hs-btn-primary {
  height: 52px;
  padding: 0 32px;
  border-radius: 10px;
  font-size: 18px;
  cursor: pointer;
  font-family: inherit;
}
.hs-btn-back {
  border: 1px solid #c3d6ec;
  background: #ffffff;
  color: #1a66c2;
}
.hs-btn-back:hover {
  background: #eef5fd;
}
.hs-btn-primary {
  border: none;
  background: #1a66c2;
  color: #ffffff;
}
.hs-btn-primary:hover {
  background: #155a9e;
}
</style>
