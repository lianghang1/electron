<script setup>
import FuneralApi from '@renderer/api/funeral'
import dayjs from 'dayjs'
import { addDays, formatDate } from '@/utils'

dayjs.locale('zh-cn')

definePage({
  meta: {
    title: '火化预定情况',
  },
})

const searchType = ref('1')

const scheduleData = ref([])

function desensitizeName(name) {
  if (!name || name.length === 0)
    return '可预定'
  // 脱敏规则：保留第一个字，其余用 * 代替（单个字符时直接返回）
  return name.length === 1 ? name : name[0] + '*'.repeat(name.length - 1)
}

function desensitizeBusinessNo(str = '') {
  if (str.length <= 6)
    return str // 如果字符串长度不足6，直接返回

  const first4 = str.substring(0, 4)
  const last2 = str.substring(str.length - 2)
  const middle = '*'.repeat(str.length - 6) // 中间的星号数量

  return first4 + middle + last2
}

async function loadData(type) {
  searchType.value = type
  let searchDate = formatDate(new Date(), 'YYYY-MM-DD')
  if (type === '2') {
    searchDate = formatDate(addDays(new Date(), 1), 'YYYY-MM-DD')
  }
  else if (type === '3') {
    searchDate = formatDate(addDays(new Date(), 2), 'YYYY-MM-DD')
  }

  const data = await FuneralApi.getBBsCremationSchedule({ selectDate: searchDate })
  const { list } = data

  const cremationData = list.map((data) => {
    const schedules = data.schedules.map((schedule) => {
      const deadName = schedule.bizInfo ? schedule.bizInfo[0].name : ''
      const businessNo = schedule.bizInfo ? schedule.bizInfo[0].businessNo : '-'

      return {
        id: schedule.id,
        businessNo: desensitizeBusinessNo(businessNo),
        className: deadName ? 'status-booked' : 'status-available',
        status: deadName ? '0' : '1',
        deadName: desensitizeName(deadName),
      }
    })

    const row = {
      name: `${data.extend?.startTime}-${data.extend?.endTime}`,
      schedules,
    }

    return row
  })

  scheduleData.value = cremationData
}

onMounted(() => {
  loadData('1')
})
</script>

<template>
  <div class="w-full">
    <div className="page-content cremation-table-content">
      <div class="date-switcher">
        <button
          class="date-button" :class="searchType === '1' ? 'active' : ''"
          @click="loadData('1')"
        >
          今天
        </button>
        <button
          class="date-button" :class="searchType === '2' ? 'active' : ''"
          @click="loadData('2')"
        >
          明天
        </button>
        <button
          class="date-button" :class="searchType === '3' ? 'active' : ''"
          @click="loadData('3')"
        >
          后天
        </button>
      </div>

      <div className="cremation-legend">
        <div className="legend-item">
          <span className="legend-color available" />
          <span>可预约</span>
        </div>
        <div className="legend-item">
          <span className="legend-color booked" />
          <span>已预约</span>
        </div>
      </div>

      <div className="reservation-table">
        <div className="table-header">
          <div className="header-cell header-time">
            时间段
          </div>
          <div className="header-cell">
            预约状态
          </div>
        </div>

        <div className="table-body">
          <div v-for="(tr, index) in scheduleData" :key="index" className="table-row">
            <div className="row-cell row-time">
              <span className="time-label">{{ tr.name }}</span>
            </div>
            <div className="row-cell reservation-status-cell">
              <div class="reservation-grid">
                <div v-for="se in tr.schedules" :key="se.id" class="reservation-slot " :class="se.status === '1' ? 'available' : 'booked'">
                  <span v-if="se.status === '1'" class="available-text">可预约</span>
                  <div v-else>
                    <div class="booked-info">
                      <div class="booked-name">
                        <span class="label">逝者：</span>
                        <span class="encrypted-name">{{ se.deadName }}</span>
                      </div>
                      <div class="business-number">
                        <span class="label">编号：</span>
                        <span class="number">{{ se.businessNo }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.cremation-table-content {
  width: 100%;
  margin: 20px auto;
  background: white;
  border-radius: 20px;
  padding: 40px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
}

.date-switcher {
  display: flex;
  gap: 15px;
  justify-content: center;
  margin-bottom: 30px;
  padding: 20px;
  background: linear-gradient(135deg, #0D47A1 0%, #0a3580 100%);
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(13, 71, 161, 0.3);
}

.date-button {
  flex: 1;
  max-width: 200px;
  padding: 14px 28px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.25) 0%, rgba(255, 255, 255, 0.15) 100%);
  color: white;
  border: 2px solid rgba(255, 255, 255, 0.5);
  border-radius: 10px;
  font-size: 18px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
  box-shadow:
    0 4px 6px rgba(0, 0, 0, 0.1),
    0 2px 4px rgba(0, 0, 0, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.3);
}

.date-button::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0;
  height: 0;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  transition: width 0.6s ease, height 0.6s ease;
}

.date-button:hover::before {
  width: 200px;
  height: 200px;
}

.date-button:hover {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.35) 0%, rgba(255, 255, 255, 0.25) 100%);
  border-color: rgba(255, 255, 255, 0.8);
  transform: translateY(-2px);
  box-shadow:
    0 8px 12px rgba(0, 0, 0, 0.15),
    0 4px 6px rgba(0, 0, 0, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.4);
}

.date-button.active {
  background: linear-gradient(180deg, #ffffff 0%, #f5f5f5 100%);
  color: #0D47A1;
  border-color: #ffffff;
  box-shadow:
    0 6px 20px rgba(255, 255, 255, 0.5),
    0 4px 8px rgba(0, 0, 0, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 1),
    inset 0 -1px 0 rgba(0, 0, 0, 0.05);
  transform: scale(1.05);
}

.date-button:active {
  transform: scale(0.98);
  box-shadow:
    0 2px 4px rgba(0, 0, 0, 0.1),
    inset 0 2px 4px rgba(0, 0, 0, 0.1);
}

.cremation-legend {
  display: flex;
  gap: 30px;
  justify-content: center;
  margin-bottom: 30px;
  padding: 20px;
  background: #f5f5f5;
  border-radius: 12px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  color: #333;
}

.legend-color {
  width: 20px;
  height: 20px;
  border-radius: 4px;
}

.legend-color.available {
  background: #2E7D32;
}

.legend-color.booked {
  background: #616161;
}

.reservation-table {
  width: 100%;
  overflow: hidden;
  border-radius: 16px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.table-header {
  display: grid;
  grid-template-columns: 15% 1fr;
  background: linear-gradient(135deg, #0D47A1 0%, #0a3580 100%);
  border-bottom: 2px solid #0a3580;
}

.header-cell {
  padding: 20px 8px;
  color: white;
  font-weight: 600;
  text-align: center;
  font-size: 16px;
  border-right: 1px solid rgba(255, 255, 255, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
}

.header-cell:last-child {
  border-right: none;
}

.table-body {
  background: white;
}

.table-row {
  display: grid;
  grid-template-columns: 15% 1fr;
  border-bottom: 1px solid #f0f0f0;
  transition: background 0.3s ease;
}

.table-row:hover {
  background: #fafafa;
}

.table-row:last-child {
  border-bottom: none;
}

.row-cell {
  padding: 10px 8px;
  text-align: center;
  border-right: 1px solid #f0f0f0;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60px;
}

.row-cell:last-child {
  border-right: none;
}

.row-time {
  justify-content: center;
  padding: 12px;
  background: #e3f2fd;
  align-items: center;
}

.time-label {
  font-size: 22px;
  font-weight: 700;
  color: #0D47A1;
  text-shadow:
    2px 2px 4px rgba(0, 0, 0, 0.15),
    0 1px 0 rgba(255, 255, 255, 0.3);
}

.reservation-status-cell {
  background: #f8f9fa;
  align-items: flex-start;
  padding: 12px;
}

.reservation-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(12%, 1fr));
  gap: 8px;
  width: 100%;
}

.reservation-slot {
  background: linear-gradient(135deg, #388E3C 0%, #2E7D32 100%);
  border-radius: 6px;
  padding: 10px;
  min-height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.reservation-slot.booked {
  background: linear-gradient(135deg, #757575 0%, #616161 100%);
}

.reservation-slot .available-text {
  color: white;
  font-size: 13px;
  font-weight: 600;
}

.reservation-slot .booked-info {
  min-width: 0;
}

.booked-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
  width: 100%;
}

.booked-name {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  font-size: 12px;
  width: 100%;
}

.booked-name {
  white-space: nowrap;
  flex-shrink: 0;
}

.booked-name .label {
  font-weight: 600;
  color: rgba(255, 255, 255, 0.95);
  font-size: 11px;
  white-space: nowrap;
}

.booked-name .encrypted-name {
  font-size: 12px;
  font-weight: 600;
  color: white;
}

.business-number {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  font-size: 11px;
  white-space: nowrap;
  flex-shrink: 0;
}

.business-number .label {
  font-weight: 600;
  color: rgba(255, 255, 255, 0.95);
  font-size: 11px;
  white-space: nowrap;
}

.business-number .number {
  font-size: 12px;
  font-weight: 500;
  color: white;
  letter-spacing: 0.3px;
}

/* 响应式设计 */
@media (max-width: 1400px) {
  .cremation-table-content {
    padding: 30px;
  }

  .table-header {
    grid-template-columns: 18% 1fr;
  }

  .header-cell {
    font-size: 14px;
  }

  .table-row {
    grid-template-columns: 18% 1fr;
  }

  .row-time {
    padding: 16px;
  }

  .time-label {
    font-size: 20px;
  }

  .row-cell.available .available-text {
    font-size: 13px;
  }

  .reservation-grid {
    grid-template-columns: repeat(auto-fill, minmax(10%, 1fr));
  }
}

@media (max-width: 1200px) {
  .table-header {
    grid-template-columns: 20% 1fr;
  }

  .header-cell {
    padding: 14px 6px;
    font-size: 13px;
  }

  .table-row {
    grid-template-columns: 20% 1fr;
  }

  .row-cell {
    padding: 12px 4px;
  }

  .row-time {
    padding: 14px 8px;
  }

  .time-label {
    font-size: 18px;
  }

  .reservation-grid {
    grid-template-columns: repeat(auto-fill, minmax(8%, 1fr));
  }

  .reservation-slot {
    padding: 8px;
    min-height: 55px;
  }

  .row-cell.booked {
    padding: 10px 4px;
    min-height: 70px;
  }

  .booked-name,
  .business-number {
    font-size: 10px;
    padding: 3px 4px;
  }
}

/* 滚动条样式 */
.cremation-table-content {
  overflow-x: auto;
}

.cremation-table-content::-webkit-scrollbar {
  height: 10px;
}

.cremation-table-content::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 5px;
}

.cremation-table-content::-webkit-scrollbar-thumb {
  background: linear-gradient(135deg, #0D47A1 0%, #0a3580 100%);
  border-radius: 5px;
}

.cremation-table-content::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(135deg, #0a3580 0%, #072861 100%);
}
</style>
