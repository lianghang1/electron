<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fh } from './api/fh'
import FhSettings from './components/FhSettings.vue'
import { fhResetCountdownKey } from './composables/use-countdown'
import { useScanner } from './composables/use-scanner'

const route = useRoute()
const router = useRouter()

// ===== 业务配置 =====

const hallName = ref('市殡仪馆')
const machineId = ref('')
const appVersion = 'v1.0.0'

// ===== 时钟 =====

const now = ref(new Date())
const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六']

const dateText = computed(() => {
  const d = now.value
  return `${d.getFullYear()}年${String(d.getMonth() + 1).padStart(2, '0')}月${String(d.getDate()).padStart(2, '0')}日 星期${WEEK_LABELS[d.getDay()]}`
})

const timeText = computed(() => {
  const d = now.value
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
})

let clockTimer: ReturnType<typeof setInterval> | null = null

// ===== 无操作倒计时：到点回首页 =====

const DEFAULT_EXPIRE_SECOND = 300

const expireSecond = ref(DEFAULT_EXPIRE_SECOND)
const countdown = ref(DEFAULT_EXPIRE_SECOND)

let countdownTimer: ReturnType<typeof setInterval> | null = null

function stopCountdown(): void {
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
}

function startCountdown(): void {
  stopCountdown()
  countdown.value = expireSecond.value
  countdownTimer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) {
      stopCountdown()
      router.push('/')
    }
  }, 1000)
}

/** 页面可注入以缩短当前轮倒计时 */
function resetCountdown(expire?: number): void {
  if (expire)
    expireSecond.value = expire
  startCountdown()
}

provide(fhResetCountdownKey, resetCountdown)

/** 交互重置：仅在数字已走动时重建计时器，避免 mousemove 高频重建 */
function handleInteraction(): void {
  if (countdown.value < expireSecond.value)
    startCountdown()
}

watch(() => route.fullPath, () => {
  expireSecond.value = DEFAULT_EXPIRE_SECOND
  startCountdown()
}, { immediate: true })

// ===== 运维设置：馆名 5s 内连点 3 次进入（升级自参考项目，连点时有进度点提示） =====

const settingsVisible = ref(false)
const hallClickCount = ref(0)
let hallClickTimer: ReturnType<typeof setTimeout> | null = null
let hallFirstClickTime = 0

function handleHallClick(): void {
  const now = Date.now()
  if (now - hallFirstClickTime > 5000) {
    hallClickCount.value = 1
    hallFirstClickTime = now
  }
  else {
    hallClickCount.value++
  }
  if (hallClickTimer)
    clearTimeout(hallClickTimer)
  hallClickTimer = setTimeout(() => {
    hallClickCount.value = 0
    hallFirstClickTime = 0
  }, 5000)
  if (hallClickCount.value >= 3) {
    hallClickCount.value = 0
    hallFirstClickTime = 0
    if (hallClickTimer) {
      clearTimeout(hallClickTimer)
      hallClickTimer = null
    }
    settingsVisible.value = true
  }
}

// 设置面板打开时暂停全局「无操作回首页」倒计时（面板自带 30s 自动关闭），关闭后恢复
watch(settingsVisible, (val) => {
  if (val)
    stopCountdown()
  else
    startCountdown()
})

// ===== 扫码分发：PB 结算业务 / dzhhz 电子火化证 / NPE 业务码 =====

const scanLoading = ref(false)

interface ScanQuery { businessId?: string, businessType?: string, [key: string]: string | undefined }

async function handleScan(content: string): Promise<void> {
  if (scanLoading.value)
    return
  scanLoading.value = true
  try {
    const { prefix, value } = await fh.decodeQrcode(content)
    if (!prefix || !value)
      return

    let query: ScanQuery = {}
    if (prefix === 'PB') {
      // PB 条码 value 为 JSON 串（业务单完整定位信息）
      try {
        query = JSON.parse(value) as ScanQuery
      }
      catch {
        query = {}
      }
    }
    else if (prefix === 'NPE' || prefix === 'dzhhz') {
      query = { businessId: value, businessType: '5' }
    }
    if (!query.businessId || !query.businessType)
      return

    const replace = route.name !== 'home'
    if (route.name === 'invoice') {
      router.push({ path: '/invoice/order-detail', query, replace })
    }
    else if (route.name === 'electronic') {
      router.push({ path: '/electronic/detail', query, replace })
    }
    else {
      router.push({ path: '/payment/order-detail', query, replace })
    }
  }
  finally {
    scanLoading.value = false
  }
}

useScanner({ onScan: code => void handleScan(code) })

// ===== 生命周期 =====

onMounted(async () => {
  clockTimer = setInterval(() => (now.value = new Date()), 1000)
  try {
    const config = await fh.getConfig()
    hallName.value = config.hallName
    machineId.value = config.machineId
  }
  catch {
    // 配置不可用时使用默认值渲染
  }
})

onBeforeUnmount(() => {
  if (clockTimer)
    clearInterval(clockTimer)
  stopCountdown()
})

const isHome = computed(() => route.name === 'home')
const pageTitle = computed(() => (route.meta.title as string | undefined) ?? '')
</script>

<template>
  <div
    class="fk-screen"
    :class="{ 'is-home': isHome }"
    @click="handleInteraction"
    @mousemove="handleInteraction"
    @touchstart="handleInteraction"
  >
    <!-- 顶栏：馆名 + 日期时间 -->
    <header class="fk-header">
      <div class="fk-header__brand">
        <svg class="fk-header__logo" viewBox="0 0 40 40" aria-hidden="true">
          <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" stroke-width="1.4" opacity="0.55" />
          <path d="M20 11c-3.2 3.4-3.2 8.2 0 11.4 3.2-3.2 3.2-8 0-11.4Z" fill="none" stroke="currentColor" stroke-width="1.6" />
          <path d="M13.5 19c-1.4 2.8-.8 6.2 1.8 8.4M26.5 19c1.4 2.8.8 6.2-1.8 8.4" fill="none" stroke="currentColor" stroke-width="1.4" opacity="0.8" />
          <path d="M13 31h14" stroke="currentColor" stroke-width="1.4" opacity="0.55" />
        </svg>
        <div class="fk-header__brand-text">
          <h1 class="fk-header__title" @click="handleHallClick">
            {{ hallName }}
          </h1>
          <span class="fk-header__unlock" :class="{ 'is-on': hallClickCount > 0 }" aria-hidden="true">
            <i v-for="n in 3" :key="n" :class="{ 'is-lit': n <= hallClickCount }" />
          </span>
        </div>
      </div>
      <div class="fk-header__time">
        <div class="fk-header__date">
          {{ dateText }}
        </div>
        <div class="fk-header__clock">
          {{ timeText }}
        </div>
      </div>
    </header>

    <!-- 主区：二级页返回条 + 页面 -->
    <main class="fk-main">
      <div v-if="!isHome" class="fk-backbar">
        <div class="fk-backbar__left">
          <button class="fk-backbar__back" @click="router.push('/')">
            <svg viewBox="0 0 16 16" class="fk-backbar__arrow" aria-hidden="true">
              <path d="M10.5 3 5.5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            返回主菜单
          </button>
          <h2 class="fk-backbar__title">
            {{ pageTitle }}
          </h2>
        </div>
        <div class="fk-backbar__countdown">
          <span class="fk-backbar__countdown-label">无操作将自动返回</span>
          <span class="fk-backbar__countdown-ring">{{ countdown }}<i>秒</i></span>
        </div>
      </div>

      <RouterView v-slot="{ Component }">
        <Transition name="fk-fade" mode="out-in">
          <component :is="Component" :key="route.fullPath" />
        </Transition>
      </RouterView>
    </main>

    <!-- 底栏：服务热线 | 设备号 | 版权 | 版本 -->
    <footer class="fk-footer">
      <span class="fk-footer__hotline">服务热线：0000-0000-000</span>
      <span>设备号：{{ machineId || '—' }}</span>
      <span>© {{ now.getFullYear() }} {{ hallName }}</span>
      <span>版本号：{{ appVersion }}</span>
    </footer>

    <!-- 运维设置：馆名连点 3 次进入 -->
    <FhSettings v-model:visible="settingsVisible" />
  </div>
</template>

<style scoped>
.fk-screen {
  position: relative;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--fh-bg);
  user-select: none;
  overflow: hidden;
}

/* 背景图图层：仅首页渐显，内页纯墨蓝底（background-image 无法过渡，用叠层 opacity 实现） */
.fk-screen::before {
  content: '';
  position: absolute;
  inset: 0;
  background: url('./assets/images/bg.png') center / cover no-repeat;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.35s ease;
}

.fk-screen.is-home::before {
  opacity: 1;
}

.fk-screen > * {
  position: relative;
}

/* ---- 顶栏 ---- */

.fk-header {
  flex: none;
  height: var(--fh-header-h);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 36px;
  color: #fff;
  background: linear-gradient(160deg, var(--fh-header-from) 0%, var(--fh-header-to) 100%);
  border-bottom: 2px solid var(--fh-gold-bright);
}

.fk-header__brand {
  display: flex;
  align-items: center;
}

.fk-header__brand-text {
  position: relative;
}

.fk-header__logo {
  width: 44px;
  height: 44px;
  color: var(--fh-gold-bright);
  margin-right: 14px;
}

.fk-header__title {
  margin: 0;
  font-family: var(--fh-font-serif);
  font-size: 27px;
  font-weight: 700;
  letter-spacing: 5px;
  white-space: nowrap;
}

/* 连点解锁进度点：仅点击后短暂浮现，平时不可见 */
.fk-header__unlock {
  position: absolute;
  left: 2px;
  bottom: -7px;
  display: flex;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.fk-header__unlock.is-on {
  opacity: 1;
}

.fk-header__unlock i {
  width: 5px;
  height: 5px;
  margin-right: 6px;
  border-radius: 50%;
  background: rgb(255 255 255 / 30%);
}

.fk-header__unlock i.is-lit {
  background: var(--fh-gold-bright);
}

.fk-header__time {
  text-align: right;
}

.fk-header__date {
  font-size: 16px;
  opacity: 0.85;
}

.fk-header__clock {
  font-family: var(--fh-font-serif);
  font-size: 28px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: 1px;
}

/* ---- 主区 ---- */

.fk-main {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 16px 36px 12px;
}

/* ---- 返回条 ---- */

.fk-backbar {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 4px 12px;
  border-bottom: 1px solid var(--fh-gold-line);
  margin-bottom: 18px;
}

.fk-backbar__left {
  display: flex;
  align-items: center;
}

.fk-backbar__back {
  display: inline-flex;
  align-items: center;
  height: 48px;
  padding: 0 24px;
  background: linear-gradient(160deg, var(--fh-cta-from) 0%, var(--fh-cta-to) 100%);
  color: var(--fh-cta-ink);
  border: none;
  border-radius: var(--fh-radius-sm);
  font-family: inherit;
  font-size: 17px;
  font-weight: 600;
  cursor: pointer;
  transition: filter 0.15s ease;
}

.fk-backbar__back:active {
  transform: scale(0.97);
  filter: brightness(0.94);
}

.fk-backbar__arrow {
  width: 14px;
  height: 14px;
  margin-right: 8px;
}

.fk-backbar__title {
  margin: 0 0 0 22px;
  font-family: var(--fh-font-serif);
  font-size: 26px;
  font-weight: 700;
  letter-spacing: 3px;
  color: var(--fh-text);
}

.fk-backbar__countdown {
  display: flex;
  align-items: center;
}

.fk-backbar__countdown-label {
  font-size: 14px;
  color: var(--fh-text-2);
  margin-right: 14px;
}

.fk-backbar__countdown-ring {
  width: 52px;
  height: 52px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1.5px solid var(--fh-gold-line);
  border-radius: 50%;
  color: var(--fh-text);
  font-family: var(--fh-font-serif);
  font-size: 18px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.fk-backbar__countdown-ring i {
  font-style: normal;
  font-size: 11px;
  font-weight: 600;
  margin-left: 2px;
  color: var(--fh-text-2);
}

/* ---- 页面切换 ---- */

.fk-fade-enter-active,
.fk-fade-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}

.fk-fade-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.fk-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* ---- 底栏 ---- */

.fk-footer {
  flex: none;
  height: var(--fh-footer-h);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 36px;
  font-size: 14px;
  color: var(--fh-text-2);
  background: rgb(255 255 255 / 65%);
  border-top: 1px solid var(--fh-line);
}

/* 服务热线：部署时替换为真实号码 */
.fk-footer__hotline {
  font-weight: 600;
  color: var(--fh-text);
}
</style>
