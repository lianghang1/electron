<script setup lang="ts">
import type { CremationScheduleResponse, ScheduleBizInfo } from '../../types/funeral'
import { onMounted, ref } from 'vue'
import { fh } from '../../api/fh'
import { fmtSlot } from '../../utils/format'

/**
 * 火化预定情况：近三日炉位班次，行=时段，格内平铺炉位（已预约展示脱敏信息）。
 */
interface SlotItem {
  id: string
  booked: boolean
  deadName: string
  businessNo: string
}

interface SlotRow {
  time: string
  schedules: SlotItem[]
}

const DATE_TABS = [
  { type: '1', label: '今天', offset: 0 },
  { type: '2', label: '明天', offset: 1 },
  { type: '3', label: '后天', offset: 2 },
]

const searchType = ref('1')
const rows = ref<SlotRow[]>([])
const loading = ref(false)

function fmtDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 逝者姓名脱敏：保留首字 */
function desensitizeName(name?: string): string {
  if (!name)
    return ''
  return name.length === 1 ? name : name[0] + '*'.repeat(name.length - 1)
}

/** 业务编号脱敏：前 4 后 2 */
function desensitizeBusinessNo(no?: string): string {
  if (!no || no.length <= 6)
    return no || '-'
  return `${no.slice(0, 4)}${'*'.repeat(no.length - 6)}${no.slice(-2)}`
}

async function loadData(type: string, offset: number): Promise<void> {
  searchType.value = type
  loading.value = true
  try {
    const selectDate = fmtDate(new Date(Date.now() + offset * 24 * 60 * 60 * 1000))
    const data: CremationScheduleResponse = await fh.getCremationSchedule(selectDate)

    rows.value = (data.list || []).map((period) => {
      return {
        time: fmtSlot(period.extend?.startTime, period.extend?.endTime),
        schedules: (period.schedules || []).map((schedule) => {
          const biz: ScheduleBizInfo | undefined = schedule.bizInfo?.[0]
          return {
            id: schedule.id,
            booked: Boolean(biz?.name),
            deadName: desensitizeName(biz?.name),
            businessNo: desensitizeBusinessNo(biz?.businessNo),
          }
        }),
      }
    })
  }
  finally {
    loading.value = false
  }
}

onMounted(() => loadData('1', 0))
</script>

<template>
  <div class="fh-page">
    <div class="fh-page-content fp-crem">
      <div class="fp-crem__toolbar">
        <div class="fp-crem__tabs">
          <button
            v-for="tab in DATE_TABS"
            :key="tab.type"
            class="fp-crem__tab"
            :class="{ 'is-active': searchType === tab.type }"
            @click="loadData(tab.type, tab.offset)"
          >
            {{ tab.label }}
          </button>
        </div>
        <div class="fp-crem__legend">
          <span class="fp-crem__legend-item"><i class="fp-crem__dot fp-crem__dot--free" />可预约</span>
          <span class="fp-crem__legend-item"><i class="fp-crem__dot fp-crem__dot--booked" />已预约</span>
        </div>
      </div>

      <!-- 班次表：行=时段，格内平铺炉位 -->
      <div v-if="rows.length" class="fp-crem__table">
        <div class="fp-crem__header">
          <span class="fp-crem__cell fp-crem__cell--time">时间段</span>
          <span class="fp-crem__cell">预约状态</span>
        </div>
        <div v-for="(row, ri) in rows" :key="ri" class="fp-crem__row">
          <span class="fp-crem__cell fp-crem__cell--time">{{ row.time }}</span>
          <span class="fp-crem__cell fp-crem__cell--slots">
            <span
              v-for="slot in row.schedules"
              :key="slot.id"
              class="fp-crem__slot"
              :class="{ 'is-booked': slot.booked }"
            >
              <template v-if="slot.booked">
                <span class="fp-crem__booked-name">逝者：{{ slot.deadName }}</span>
                <span class="fp-crem__booked-no">编号：{{ slot.businessNo }}</span>
              </template>
              <template v-else>
                <span class="fp-crem__free">可预约</span>
              </template>
            </span>
          </span>
        </div>
      </div>

      <div v-else class="fp-crem__empty">
        {{ loading ? '正在加载班次...' : '暂无班次信息' }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.fp-crem {
  display: flex;
  flex-direction: column;
  padding: 20px 24px;
}

.fp-crem__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: none;
  margin-bottom: 16px;
}

.fp-crem__tabs {
  display: flex;
}

.fp-crem__tab {
  width: 110px;
  height: 44px;
  border: 1px solid var(--fh-line-strong);
  background: var(--fh-surface);
  color: var(--fh-text-2);
  font-family: inherit;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.fp-crem__tab:first-child {
  border-radius: var(--fh-radius-sm) 0 0 var(--fh-radius-sm);
}

.fp-crem__tab:last-child {
  border-radius: 0 var(--fh-radius-sm) var(--fh-radius-sm) 0;
  border-left: none;
}

.fp-crem__tab.is-active {
  background: var(--fh-ink);
  border-color: var(--fh-ink);
  color: #fff;
}

.fp-crem__legend {
  display: flex;
}

.fp-crem__legend-item {
  display: flex;
  align-items: center;
  font-size: 14px;
  color: var(--fh-text-2);
  margin-left: 20px;
}

.fp-crem__dot {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  margin-right: 6px;
}

.fp-crem__dot--free {
  background: var(--fh-surface);
  border: 1px solid var(--fh-line-strong);
}

.fp-crem__dot--booked {
  background: var(--fh-gold);
}

/* ---- 表格 ---- */

.fp-crem__table {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--fh-line);
  border-radius: var(--fh-radius);
  overflow-y: auto;
}

.fp-crem__header,
.fp-crem__row {
  display: flex;
}

.fp-crem__header {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--fh-surface-2);
  border-bottom: 1px solid var(--fh-line);
}

.fp-crem__row {
  border-bottom: 1px solid var(--fh-line);
}

.fp-crem__row:last-child {
  border-bottom: none;
}

.fp-crem__cell {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  border-right: 1px solid var(--fh-line);
  font-size: 15px;
  color: var(--fh-text);
}

.fp-crem__header .fp-crem__cell {
  font-weight: 700;
}

.fp-crem__cell:last-child {
  border-right: none;
  flex: 1;
}

.fp-crem__cell--time {
  flex: none;
  width: 150px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  background: var(--fh-surface-2);
}

.fp-crem__cell--slots {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  padding: 10px;
}

.fp-crem__slot {
  width: 200px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--fh-line);
  border-radius: var(--fh-radius-sm);
  padding: 10px 8px;
  margin: 0 10px 10px 0;
}

.fp-crem__slot:nth-child(4n) {
  margin-right: 0;
}

.fp-crem__slot.is-booked {
  background: var(--fh-gold-soft);
  border-color: var(--fh-gold);
  box-shadow: inset 0 2px 0 var(--fh-gold);
}

.fp-crem__booked-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--fh-text);
}

.fp-crem__booked-no {
  font-size: 12px;
  color: var(--fh-text-2);
  margin-top: 3px;
  font-variant-numeric: tabular-nums;
}

.fp-crem__free {
  font-size: 13px;
  letter-spacing: 1px;
  color: var(--fh-text-3);
}

.fp-crem__empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--fh-text-3);
  font-size: 16px;
}
</style>
