import type { AsarUpdateState, UpdateState } from '@desktop/shared'
import { onBeforeUnmount, onMounted, ref } from 'vue'

/** 更新流程状态：订阅 Main 推送的全量状态机 */
export function useUpdateState() {
  const state = ref<UpdateState | null>(null)
  let unsubscribe: (() => void) | null = null

  onMounted(() => {
    unsubscribe = window.desktop.events.on('update:state', (value) => {
      state.value = value
    })
  })
  onBeforeUnmount(() => {
    unsubscribe?.()
  })
  return { state }
}

/** asar 热更状态：pending = 已就绪，重启应用生效 */
export function useAsarUpdateState() {
  const state = ref<AsarUpdateState | null>(null)
  let unsubscribe: (() => void) | null = null

  onMounted(() => {
    unsubscribe = window.desktop.events.on('update:asarState', (value) => {
      state.value = value
    })
  })
  onBeforeUnmount(() => {
    unsubscribe?.()
  })
  return { state }
}
