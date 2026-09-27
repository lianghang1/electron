<script setup lang="ts">
import type { HallScheduleResponse, ScheduleBizInfo } from '../../types/funeral'
import { onMounted, ref } from 'vue'
import { fh } from '../../api/fh'
import { fmtSlot } from '../../utils/format'

/**
 * 礼厅预定情况：近三日班次表，行=时段（去重排序），列=礼厅，已预约展示脱敏信息。
 */
interface SlotCell {
  columnName: boolean
  time: string
  statusClass?: 'booked' | 'available'
  displayName?: string
  displayBusinessNo?: string
}

const DATE_TABS = [
  { type: '1', label: '今天', offset: 0 },
  { type: '2', label: '明天', offset: 1 },
  { type: '3', label: '后天', offset: 2 },
]

const searchType = ref('1')
const headers = ref<string[]>([])
const rows = ref<SlotCell[][]>([])
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

function firstBiz(bizInfo?: ScheduleBizInfo[]): ScheduleBizInfo | undefined {
  return bizInfo?.[0]
}

async function loadData(type: string, offset: number): Promise<void> {
  searchType.value = type
  loading.value = true
  try {
    const selectDate = fmtDate(new Date(Date.now() + offset * 24 * 60 * 60 * 1000))
    const data: HallScheduleResponse = await fh.getHallSchedule(selectDate)
    const list = data.list || []

    // 时段去重排序（mock 返回完整时间戳，首列展示时截取 HH:mm）
    const slotMap = new Map<string, { start: string, end: string }>()
    for (const hall of list) {
      for (const schedule of hall.schedules) {
        const key = `${schedule.startTime}-${schedule.endTime}`
        if (!slotMap.has(key))
          slotMap.set(key, { start: schedule.startTime || '', end: schedule.endTime || '' })
      }
    }
    const slots = [...slotMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))

    headers.value = list.map(hall => hall.name)

    rows.value = slots.map(([key, range]) => {
      const row: SlotCell[] = [{ columnName: true, time: fmtSlot(range.start, range.end) }]
      for (const hall of list) {
        const schedule = hall.schedules.find(s => `${s.startTime}-${s.endTime}` === key)
        const biz = firstBiz(schedule?.bizInfo)
        if (biz?.name) {
          row.push({
            columnName: false,
            time: '',
            statusClass: 'booked',
            displayName: desensitizeName(biz.name),
            displayBusinessNo: desensitizeBusinessNo(biz.businessNo),
          })
        }
        else {
          row.push({ columnName: false, time: '', statusClass: 'available' })
        }
      }
      return row
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
    <div class="fh-page-content fp-hall">
      <div class="fp-hall__toolbar">
        <div class="fp-hall__tabs">
          <button
            v-for="tab in DATE_TABS"
            :key="tab.type"
            class="fp-hall__tab"
            :class="{ 'is-active': searchType === tab.type }"
            @click="loadData(tab.type, tab.offset)"
          >
            {{ tab.label }}
          </button>
        </div>
        <div class="fp-hall__legend">
          <span class="fp-hall__legend-item"><i class="fp-hall__dot fp-hall__dot--free" />可预约</span>
          <span class="fp-hall__legend-item"><i class="fp-hall__dot fp-hall__dot--booked" />已预约</span>
        </div>
      </div>

      <!-- 班次表：行=时段，列=礼厅 -->
      <div v-if="rows.length" class="fp-hall__table">
        <div class="fp-hall__header">
          <span class="fp-hall__cell fp-hall__cell--time">时间段</span>
          <span v-for="hall in headers" :key="hall" class="fp-hall__cell">{{ hall }}</span>
        </div>
        <div v-for="(row, ri) in rows" :key="ri" class="fp-hall__row">
          <template v-for="(cell, ci) in row" :key="ci">
            <span v-if="cell.columnName" class="fp-hall__cell fp-hall__cell--time">{{ cell.time }}</span>
            <span v-else class="fp-hall__cell fp-hall__cell--slot" :class="cell.statusClass">
              <template v-if="cell.statusClass === 'booked'">
                <span class="fp-hall__booked-name">逝者：{{ cell.displayName }}</span>
                <span class="fp-hall__booked-no">编号：{{ cell.displayBusinessNo }}</span>
              </template>
              <template v-else>
                <span class="fp-hall__free">可预约</span>
              </template>
            </span>
          </template>
        </div>
      </div>

      <div v-else class="fp-hall__empty">
        {{ loading ? '正在加载班次...' : '暂无班次信息' }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.fp-hall {
  display: flex;
  flex-direction: column;
  padding: 20px 24px;
}

.fp-hall__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: none;
  margin-bottom: 16px;
}

.fp-hall__tabs {
  display: flex;
}

.fp-hall__tab {
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

.fp-hall__tab:first-child {
  border-radius: var(--fh-radius-sm) 0 0 var(--fh-radius-sm);
}

.fp-hall__tab:last-child {
  border-radius: 0 var(--fh-radius-sm) var(--fh-radius-sm) 0;
  border-left: none;
}

.fp-hall__tab.is-active {
  background: var(--fh-ink);
  border-color: var(--fh-ink);
  color: #fff;
}

.fp-hall__legend {
  display: flex;
}

.fp-hall__legend-item {
  display: flex;
  align-items: center;
  font-size: 15px;
  color: var(--fh-text-2);
  margin-left: 24px;
}

.fp-hall__dot {
  width: 14px;
  height: 14px;
  border-radius: 4px;
  margin-right: 8px;
}

.fp-hall__dot--free {
  background: var(--fh-surface);
  border: 1px solid var(--fh-line-strong);
}

.fp-hall__dot--booked {
  background: var(--fh-gold);
}

/* ---- 表格 ---- */

.fp-hall__table {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--fh-line);
  border-radius: var(--fh-radius);
  overflow-y: auto;
}

.fp-hall__header,
.fp-hall__row {
  display: flex;
}

.fp-hall__header {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--fh-surface-2);
  border-bottom: 2px solid rgb(36 86 184 / 30%);
}

.fp-hall__row {
  flex: 1;
  min-height: 64px;
  border-bottom: 1px solid var(--fh-line);
}

.fp-hall__row:last-child {
  border-bottom: none;
}

.fp-hall__cell {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 10px 8px;
  border-right: 1px solid var(--fh-line);
  font-size: 15px;
  color: var(--fh-text);
}

.fp-hall__header .fp-hall__cell {
  font-size: 15px;
  font-weight: 700;
  color: var(--fh-ink-deep);
  padding: 14px 8px;
}

.fp-hall__cell:last-child {
  border-right: none;
}

.fp-hall__cell--time {
  flex: none;
  width: 150px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  background: var(--fh-surface-2);
}

.fp-hall__cell--slot.booked {
  background: var(--fh-gold-soft);
  box-shadow: inset 0 2px 0 var(--fh-gold);
}

.fp-hall__booked-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--fh-text);
}

.fp-hall__booked-no {
  font-size: 12px;
  color: var(--fh-text-2);
  margin-top: 3px;
  font-variant-numeric: tabular-nums;
}

.fp-hall__free {
  font-size: 13px;
  letter-spacing: 1px;
  color: var(--fh-text-3);
}

.fp-hall__empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--fh-text-3);
  font-size: 16px;
}
</style>
