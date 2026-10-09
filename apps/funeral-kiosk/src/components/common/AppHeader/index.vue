<script setup lang="ts">
import dayjs from 'dayjs'
import { onMounted, onUnmounted, ref } from 'vue'
import 'dayjs/locale/zh-cn'

const emit = defineEmits(['openConfig'])

dayjs.locale('zh-cn')

let timeInterval: number | null = null
let clickTimer: number | null = null
let firstClickTime: number = 0

const currentTime = ref('')
const currentDate = ref('')
const clickCount = ref<number>(0)

function updateCurrentTime() {
  currentTime.value = dayjs().format('A HH:mm')
  currentDate.value = dayjs().format('YYYY年MM月DD日 dddd')
}

function handleConfigClick() {
  const now = Date.now()

  if (clickCount.value === 0) {
    firstClickTime = now
  }

  if (now - firstClickTime > 5000) {
    clickCount.value = 1
    firstClickTime = now
  }
  else {
    clickCount.value++
  }

  if (clickTimer) {
    clearTimeout(clickTimer)
  }

  clickTimer = setTimeout(() => {
    clickCount.value = 0
    firstClickTime = 0
  }, 5000)

  if (clickCount.value >= 3) {
    clickCount.value = 0
    firstClickTime = 0
    emit('openConfig')
  }
}

onMounted(() => {
  updateCurrentTime()
  timeInterval = setInterval(updateCurrentTime, 1000)
})

onUnmounted(() => {
  if (timeInterval) {
    clearInterval(timeInterval)
  }
})
</script>

<template>
  <div class="app-header">
    <div class="app-header__content">
      <div class="app-header__left">
        <div class="app-header__title-container">
          <div class="app-header__logo-section">
            <div class="app-header__logo-icon">
              <img src="@/assets/images/logo/bz.png" style="width: 100%; height: 100%">
            </div>
          </div>
          <h1 class="app-header__page-title" @click="handleConfigClick">
            北京市八宝山殡仪馆
          </h1>
        </div>
      </div>

      <div class="app-header__right">
        <div class="app-header__system-time">
          <div class="app-header__current-date">
            {{ currentDate }}
          </div>
          <div class="app-header__current-time">
            {{ currentTime }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.app-header {
  background: linear-gradient(311deg, #313fbc 0%, #1D2BA5 100%);
  color: white;
  transition: all 0.3s ease;
  height: 80px;
  display: flex;
  align-items: center;
}

.app-header__content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  max-width: 1600px;
  margin: 0 auto;
  padding: 0 30px;
  height: 100%;
}

.app-header__left {
  display: flex;
  align-items: center;
  gap: 15px;
  height: 100%;
}

.app-header__title-container {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 100%;
  align-items: center;
}

.app-header__logo-section {
  display: flex;
  align-items: center;
}

.app-header__logo-icon {
  width: 70px;
  height: 60px;
}

.app-header__page-title {
  font-size: 26px;
  font-weight: 600;
  margin: 0;
  color: white;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  white-space: nowrap;
}

.app-header__right {
  display: flex;
  align-items: center;
}

.app-header__system-time {
  text-align: right;
  font-family: 'Outfit', sans-serif;
}

.app-header__current-date {
  font-size: 18px;
  margin-bottom: 5px;
  opacity: 0.9;
  color: white;
}

.app-header__system-time .app-header__current-time {
  font-size: 22px;
  font-weight: 700;
  color: white;
  background: none;
  padding: 0;
  border-radius: 0;
  box-shadow: none;
  backdrop-filter: none;
  border: none;
}
</style>
