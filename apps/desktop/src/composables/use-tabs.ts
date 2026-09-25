import type { DesktopTab } from '@desktop/shared'
import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * Shell 的 Tab 状态：初始拉取 + 订阅平台推送（tabs:updated 全量列表），
 * UI 只发指令（open/close/activate/reload），状态一律以平台推送为准。
 */
export function useTabs() {
  const tabs = ref<DesktopTab[]>([])

  async function open(appId: string): Promise<void> {
    await window.desktop.tabs.open({ appId })
  }

  async function close(tabId: string): Promise<void> {
    await window.desktop.tabs.close(tabId)
  }

  async function activate(tabId: string): Promise<void> {
    await window.desktop.tabs.activate(tabId)
  }

  async function reload(tabId: string): Promise<void> {
    await window.desktop.tabs.reload(tabId)
  }

  let unsubscribe: (() => void) | null = null
  onMounted(async () => {
    unsubscribe = window.desktop.events.on('tabs:updated', (list) => {
      tabs.value = list
    })
    tabs.value = await window.desktop.tabs.list()
  })
  onBeforeUnmount(() => unsubscribe?.())

  return { tabs, open, close, activate, reload }
}
