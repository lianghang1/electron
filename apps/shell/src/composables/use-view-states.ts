import type { Ref } from 'vue'
import type { ShellTab } from './use-shell-tabs'
import { shell } from '@shell/bridge/client'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * 视图加载状态：主进程按视图生命周期广播（tabs.state-changed），
 * 垫场（loading）与失败兜底（failed）据此显隐；failed 保留到重试成功。
 */
export function useViewStates(activeTab: Ref<ShellTab | null | undefined>) {
  const viewStates = ref<Record<string, 'loading' | 'failed'>>({})
  let offTabState: (() => void) | undefined

  const activeViewState = computed(() => {
    const id = activeTab.value?.instanceId
    return (id ? viewStates.value[id] : undefined) ?? null
  })

  function retryActive() {
    const id = activeTab.value?.instanceId
    if (id) { void shell().tabs.reload(id) }
  }

  /** 跨进程载荷不可信：形状不符就忽略，不渲染脏数据 */
  function isTabState(value: unknown): value is { instanceId: string, action: string } {
    if (!value || typeof value !== 'object') { return false }
    const p = value as Record<string, unknown>
    return typeof p.instanceId === 'string' && typeof p.action === 'string'
  }

  function onTabStateChanged(payload: unknown) {
    if (!isTabState(payload)) { return }
    const { instanceId, action } = payload
    if (action === 'loading-started') {
      viewStates.value = { ...viewStates.value, [instanceId]: 'loading' }
    }
    else if (action === 'load-failed') {
      viewStates.value = { ...viewStates.value, [instanceId]: 'failed' }
    }
    else if (action === 'loading-finished' && viewStates.value[instanceId] === 'loading') {
      // 只清 loading 态：失败场景 did-stop-loading 也抵达，failed 标记保留到重试
      const next = { ...viewStates.value }
      delete next[instanceId]
      viewStates.value = next
    }
  }

  onMounted(() => {
    offTabState = shell().onEvent('tabs.state-changed', onTabStateChanged)
  })

  onBeforeUnmount(() => {
    offTabState?.()
  })

  return { activeViewState, retryActive }
}
