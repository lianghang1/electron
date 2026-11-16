import { shell } from '@shell/bridge/client'
import { ref } from 'vue'
import { useShellTabs } from './use-shell-tabs'

/**
 * 工作台启动序列：事件订阅 → 最近会话/应用清单 → 环境信息 → solo 直出 → 启动握手。
 * 首应用 open 结果（成功/失败）都 dispatch shell-app-opened，启动层撤层出口恒存在；
 * 无直出目标（platform / 清单为空或多个）时撤层条件当场满足。
 */
export function useWorkbenchBoot() {
  const chrome = ref<'platform' | 'solo'>(shell().shell.appearance().chrome)
  const mode = ref<'windowed' | 'kiosk'>('windowed')
  const forceRequiredVersion = ref<string | null>(null)
  const { appList, watchAppEvents, loadRecent, loadApps, openApp } = useShellTabs()

  let offForceRequired: (() => void) | undefined
  let offAppEvents: (() => void) | undefined

  /** 跨进程载荷不可信：形状不符就忽略 */
  function isForceRequired(value: unknown): value is { requiredVersion: string } {
    if (!value || typeof value !== 'object') { return false }
    return typeof (value as Record<string, unknown>).requiredVersion === 'string'
  }

  async function start(): Promise<void> {
    offAppEvents = watchAppEvents()
    offForceRequired = shell().onEvent('update.force-required', (payload) => {
      if (isForceRequired(payload)) { forceRequiredVersion.value = payload.requiredVersion }
    })
    loadRecent()
    await loadApps()
    const info = await shell().shell.info()
    mode.value = info.mode
    if (info.forceUpdate?.blocked) { forceRequiredVersion.value = info.forceUpdate.requiredVersion ?? '' }
    // solo 直出的应用就是清单本身：恰为一个时直开它，platform 永不自动开（时钟页是唯一起点）
    const directApp = chrome.value === 'solo' && appList.value.length === 1 ? appList.value[0].manifest.id : ''
    if (directApp) {
      try {
        await openApp(directApp)
      }
      finally {
        window.dispatchEvent(new Event('shell-app-opened'))
      }
    }
    else {
      window.dispatchEvent(new Event('shell-app-opened'))
    }
  }

  function dispose(): void {
    offForceRequired?.()
    offAppEvents?.()
  }

  return { chrome, mode, forceRequiredVersion, start, dispose }
}
