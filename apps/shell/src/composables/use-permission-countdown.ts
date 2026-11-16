import { ref, watch } from 'vue'

/** 授权卡倒计时：与 Main 的 30s 超时同源，归零由 Main 按拒绝收尾（master 同款语义） */
const REQUEST_TIMEOUT_S = 30

export function usePermissionCountdown(requestId: () => string | undefined) {
  const countdown = ref(REQUEST_TIMEOUT_S)
  let countdownTimer: ReturnType<typeof setInterval> | undefined

  watch(requestId, (id) => {
    clearInterval(countdownTimer)
    if (!id) { return }
    countdown.value = REQUEST_TIMEOUT_S
    countdownTimer = setInterval(() => {
      if (countdown.value > 0) { countdown.value -= 1 }
    }, 1000)
  }, { immediate: true })

  function stop() {
    clearInterval(countdownTimer)
  }

  return { countdown, requestTimeoutS: REQUEST_TIMEOUT_S, stop }
}
