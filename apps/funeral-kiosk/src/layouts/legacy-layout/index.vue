<script setup lang="ts">
import type { ScanResult } from '@desktop/shared'

import { isEmpty, parseJson } from '@desktop/utils'
import CommonApi from '@/api/common'
import { httpContext } from '@/http/context'
import { ResourceType } from '@/utils/biz'
import AppBackWithCountdown from './AppBackWithCountdown/index.vue'
import AppConfig from './AppConfig/index.vue'
import AppFooter from './AppFooter/index.vue'
import AppGlobalLoading from './AppGlobalLoading.vue'
import AppGlobalMessage from './AppGlobalMessage/index.vue'
import AppHeader from './AppHeader/index.vue'
import { useGlobalLoadingStore, useGlobalMessageStore } from './store'

const router = useRouter()
const route = useRoute()
const { setResetCountdownFn } = setupAppContext()
const globalLoadingStore = useGlobalLoadingStore()
const globalMessageStore = useGlobalMessageStore()
const appStore = useAppStore()

const countdownTimer = ref<{
  start: () => void
  stop: () => void
  trigger: () => void
}>()
const countdown = ref<number>(0)
const inactivityTimeout = ref<number>(appStore.inactivityTimeout)
const scanLoading = ref(false)
const configVisible = ref<boolean>(false)

const isSecondaryPage = computed<boolean>(() => {
  return route.name !== 'Root'
})

const visibleGlobalBg = computed<boolean>(() => {
  return !isSecondaryPage.value
})

const currentPageTitle = computed<string>(() => {
  return router.currentRoute.value.meta.title as string || '智能自助服务系统'
})

countdownTimer.value = useTimeTask((start, stop) => {
  countdown.value--
  if (countdown.value <= 0) {
    stop()
    router.push('/')
    return
  }
  start()
}, 1000, false)

let diifStartCountdownTask: number | null = null

function startCountdown() {
  if (diifStartCountdownTask) {
    console.log('quxiao')
    clearTimeout(diifStartCountdownTask)
  }
  diifStartCountdownTask = setTimeout(() => {
    console.log('zhixing')
    if (countdownTimer.value) {
      countdownTimer.value.stop()
    }
    countdown.value = inactivityTimeout.value
    countdownTimer.value?.trigger()
  }, 1000)
}

function handleBack() {
  router.push('/')
}

function handleUserInteraction() {
  startCountdown()
}

function handleTimeoutLoading() {
  globalLoadingStore.forceHideLoading()
}

function handleOpenConfig() {
  configVisible.value = true
}

function handleCloseConfig() {
  configVisible.value = false
}

async function onScan(result: ScanResult) {
  if (scanLoading.value) {
    return
  }
  scanLoading.value = true
  try {
    const data = await CommonApi.decodeQrcode({ content: result.code, bizCodeToId: true })
    if (!data?.prefix || !data?.value) {
      return
    }
    let queryData: Record<string, any> = {}
    if (ResourceType.PB.prefix === data.prefix) {
      queryData = parseJson(data.value, {})
    }
    else if (ResourceType.NPE.prefix === data.prefix || ResourceType.DZHHZ.prefix === data.prefix) {
      queryData = {
        businessId: data.value,
        businessType: '5',
      }
    }

    let replace: boolean = true
    if (route.name === 'Root') {
      replace = false
    }
    if (isEmpty(queryData?.businessId) || isEmpty(queryData?.businessType)) {
      return
    }

    if (route.name === 'Invoice') {
      router.push({
        path: '/invoice/order-detail',
        query: queryData,
        replace,
      })
    }
    else if (route.name === 'Electronic') {
      router.push({
        path: '/electronic/detail',
        query: queryData,
        replace,
      })
    }
    else {
      router.push({
        path: '/payment/order-detail',
        query: queryData,
        replace,
      })
    }
  }
  finally {
    scanLoading.value = false
  }
}

onMounted(async () => {
  await appStore.initApp()
  inactivityTimeout.value = appStore.inactivityTimeout
  startCountdown()

  setResetCountdownFn((inactivity: number) => {
    inactivityTimeout.value = inactivity
    startCountdown()
  })

  watch(() => route.name, () => {
    inactivityTimeout.value = route.meta?.countdown || appStore.inactivityTimeout
    startCountdown()
  }, {
    immediate: true,
  })

  window.desktop.events.on('scanner:scanReceived', onScan)

  httpContext.set({
    showError: (msg?: string | null) => {
      if (msg) {
        globalMessageStore.error({ message: msg })
      }
    },
    showLoading: () => {
      globalLoadingStore.showLoading()
    },
    hideLoading: () => {
      globalLoadingStore.hideLoading()
    },
  })
})
</script>

<template>
  <div
    class="app-container"
    :class="{
      'app-container__bg': visibleGlobalBg,
    }"
    @click="handleUserInteraction"
    @mousemove="handleUserInteraction"
    @touchstart="handleUserInteraction"
  >
    <AConfigProvider size="large">
      <div class="app-content">
        <AppHeader @open-config="handleOpenConfig" />
        <main class="app-main">
          <AppBackWithCountdown
            :is-secondary-page="isSecondaryPage" :page-title="currentPageTitle"
            :countdown="countdown" @back="handleBack"
          />
          <RouterView v-slot="{ Component, route }">
            <Transition name="fade-slide" mode="out-in">
              <component :is="Component" :key="route.name" class="app-wrapper transition-300" />
            </Transition>
          </RouterView>

          <div class="app-bg-grid" />
        </main>

        <AppFooter :is-home="visibleGlobalBg" />
      </div>
    </AConfigProvider>

    <AppGlobalLoading
      :is-visible="globalLoadingStore.isLoading"
      @timeout="handleTimeoutLoading"
    />

    <AppGlobalMessage
      :is-visible="globalMessageStore.messageState.visible"
      :type="globalMessageStore.messageState.type"
      :title="globalMessageStore.messageState.title"
      :message="globalMessageStore.messageState.message"
      :auto-close="globalMessageStore.messageState.autoClose"
      @close="globalMessageStore.hideMessage"
      @timeout="globalMessageStore.hideMessage"
    />

    <!-- <BizAppUpdatePopup /> -->

    <AppConfig :is-visible="configVisible" @close="handleCloseConfig" />
  </div>
</template>

<style scoped lang="scss">
.app-container {
  width: 100vw;
  height: 100vh;
  position: relative;
  font-family: 'Noto Sans SC', sans-serif;
  overflow-x: hidden;

  display: flex;
  flex-direction: column;

  &__bg {
    background-image: url('@/assets/images/bg.png');
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
  }
}

.app-content {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.app-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: center;
  padding: 0 40px 20px;
  overflow-x: hidden;
  width: 100%;
}

.app-bg-grid {
  position: fixed;
  inset: 0;
  background-image: linear-gradient(rgba(0, 53, 148, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 53, 148, 0.03) 1px, transparent 1px);
  background-size: 40px 40px;
  z-index: -1;
}

.app-wrapper {
  -ms-overflow-style: none;
  scroll-behavior: smooth;
  /* 增强触摸滑动体验 */
  -webkit-overflow-scrolling: touch;
  /* 控制滚动边界行为 */
  overscroll-behavior-y: contain;
  /* 添加滚动惯性感 */
  scroll-snap-type: y proximity;
}
</style>
