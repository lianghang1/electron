import type { LoadingOptions, LoadingState } from './_core/types'
import { defineStore } from 'pinia'
import { computed, onScopeDispose, ref } from 'vue'

export const useGlobalLoadingStore = defineStore('global-loading-store', () => {
  // State
  const times = ref(0)
  const timer = ref<ReturnType<typeof setTimeout> | null>(null)
  const isShowed = ref(false)
  const isPending = ref(false)
  const options = ref<Required<LoadingOptions>>({
    delay: 300,
    debug: false,
  })

  function clearTimer() {
    if (timer.value) {
      clearTimeout(timer.value)
      timer.value = null
    }
  }

  function setOptions(newOptions: LoadingOptions = {}) {
    options.value = {
      delay: Math.max(0, newOptions.delay ?? 0),
      debug: newOptions.debug ?? false,
    }
  }

  function log(message?: any, ...optionalParams: any[]) {
    if (!options.value.debug) {
      return
    }
    console.log(`[Loading Store] ${message}`, ...optionalParams)
  }

  function showLoading() {
    times.value++

    if (isShowed.value) {
      return
    }

    if (isPending.value) {
      return
    }

    isPending.value = true
    clearTimer()

    timer.value = setTimeout(() => {
      if (times.value <= 0) {
        isPending.value = false
        clearState()
        return
      }

      log('显示 loading')

      isShowed.value = true
      isPending.value = false
      timer.value = null
    }, options.value.delay)
  }

  function hideLoading() {
    if (times.value > 0) {
      times.value--
    }

    if (times.value <= 0) {
      clearState()
    }
  }

  function forceHideLoading() {
    times.value = 0
    clearState()
  }

  function clearState() {
    clearTimer()

    isShowed.value = false
    isPending.value = false
  }

  function destroy() {
    clearState()
  }

  function getState(): Omit<LoadingState, 'options'> {
    return {
      times: times.value,
      isShowed: isShowed.value,
      isPending: isPending.value,
      timer: timer.value,
    }
  }

  function resetCounter() {
    times.value = 0
  }

  const isLoading = computed(() => isShowed.value)
  const loadingCount = computed(() => times.value)
  const isInProgress = computed(() => times.value > 0)

  onScopeDispose(() => {
    destroy()
  })

  return {
    // Computed
    isLoading,
    loadingCount,
    isInProgress,

    // Actions
    setOptions,
    showLoading,
    hideLoading,
    forceHideLoading,
    destroy,
    getState,
    resetCounter,
    log,
  }
})
