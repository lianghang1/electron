import type { Ref } from 'vue'
import type { ShellTab } from './use-shell-tabs'
import { onBeforeUnmount, onMounted } from 'vue'

interface ShortcutDeps {
  chrome: Ref<'platform' | 'solo'>
  tabs: Ref<ShellTab[]>
  activeKey: Ref<string>
  activate: (tab: ShellTab) => void
  openAppCenter: () => void
}

/** 工作台全局快捷键（仅 platform 档）：Ctrl+K 应用中心、Ctrl+Tab 循环页签、数字键直达 */
export function useWorkbenchShortcuts(deps: ShortcutDeps) {
  function onGlobalKeydown(e: KeyboardEvent) {
    if (deps.chrome.value !== 'platform') { return }
    const mod = e.ctrlKey || e.metaKey
    if (!mod) { return }

    if (e.key === 'k' || e.key === 'K') {
      e.preventDefault()
      deps.openAppCenter()
      return
    }
    if (e.key === 'Tab' && deps.tabs.value.length > 1) {
      e.preventDefault()
      const idx = deps.tabs.value.findIndex(t => t.key === deps.activeKey.value)
      const step = e.shiftKey ? -1 : 1
      const next = (idx + step + deps.tabs.value.length) % deps.tabs.value.length
      deps.activate(deps.tabs.value[next]!)
      return
    }
    if (/^[1-9]$/.test(e.key)) {
      const tab = deps.tabs.value[Number(e.key) - 1]
      if (tab) {
        e.preventDefault()
        deps.activate(tab)
      }
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', onGlobalKeydown)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onGlobalKeydown)
  })
}
