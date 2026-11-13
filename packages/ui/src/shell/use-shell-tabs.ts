import { desktop } from '@shell/bridge/client'
import { computed, ref } from 'vue'

export interface ShellTab {
  key: string
  title: string
  iconColor: string
  instanceId?: string
  appId?: string
}

export interface AppSummary {
  manifest: { id: string, name: string, icon?: string, entry: { kind: string } }
}

const TAB_COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#06b6d4']
const RECENT_KEY = 'shell.recentAppIds'
const MAX_RECENT = 8

/**
 * tab 会话状态：开/切/关/排序/事件同步/最近使用，纯状态零 DOM。
 * 应用打开/关闭全量以 app.opened/closed 事件为准，本地 openApp 的重复事件靠 instanceId 去重。
 */
export function useShellTabs() {
  const tabs = ref<ShellTab[]>([])
  const activeKey = ref('')
  const recentIds = ref<string[]>([])
  const appList = ref<AppSummary[]>([])

  const activeTab = computed(() => tabs.value.find(t => t.key === activeKey.value))

  function colorFor(appId: string): string {
    let hash = 0
    for (const ch of appId) { hash = (hash * 31 + ch.charCodeAt(0)) >>> 0 }
    return TAB_COLORS[hash % TAB_COLORS.length]!
  }

  function rememberRecent(appId: string) {
    recentIds.value = [appId, ...recentIds.value.filter(id => id !== appId)].slice(0, MAX_RECENT)
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(recentIds.value))
    }
    catch { /* 隐私模式下 localStorage 不可用：本次会话内仍有效 */ }
  }

  function activate(tab: ShellTab) {
    activeKey.value = tab.key
    void desktop().apps.activate(tab.instanceId ?? '')
  }

  async function openApp(appId: string) {
    const result = await desktop().apps.open(appId) as { instanceId: string, handle: Record<string, unknown> }
    const manifest = appList.value.find(a => a.manifest.id === appId)?.manifest
    const target = tabs.value.find(t => t.instanceId === result.instanceId)
      ?? tabs.value.find(t => t.appId === appId)
    rememberRecent(appId)
    if (target) {
      activate(target)
      return
    }
    const tab: ShellTab = {
      key: result.instanceId,
      title: manifest?.name ?? appId,
      iconColor: colorFor(appId),
      instanceId: result.instanceId,
      appId,
    }
    tabs.value.push(tab)
    activate(tab)
  }

  /** 浮层/应用中心等其他入口打开应用时同步 tab */
  function ensureTabFromEvent(appId: string, instanceId: string): void {
    const existing = tabs.value.find(t => t.instanceId === instanceId || t.appId === appId)
    if (existing) {
      if (existing.instanceId !== instanceId) { existing.instanceId = instanceId }
      return
    }
    const manifest = appList.value.find(a => a.manifest.id === appId)?.manifest
    const tab: ShellTab = {
      key: instanceId,
      title: manifest?.name ?? appId,
      iconColor: colorFor(appId),
      instanceId,
      appId,
    }
    tabs.value.push(tab)
    void activate(tab)
  }

  function closeTab(tab: ShellTab) {
    tabs.value = tabs.value.filter(t => t.key !== tab.key)
    if (tab.instanceId) { void desktop().apps.close(tab.instanceId) }
    if (activeKey.value === tab.key) {
      const next = tabs.value[tabs.value.length - 1]
      if (next) {
        activate(next)
      }
      else {
        activeKey.value = ''
        void desktop().apps.activate('')
      }
    }
  }

  function moveTab(fromKey: string, toKey: string) {
    const arr = [...tabs.value]
    const fromIdx = arr.findIndex(t => t.key === fromKey)
    const toIdx = arr.findIndex(t => t.key === toKey)
    if (fromIdx < 0 || toIdx < 0) { return }
    const [moved] = arr.splice(fromIdx, 1)
    arr.splice(toIdx, 0, moved!)
    tabs.value = arr
  }

  /** 订阅应用生命周期事件（返回清理函数） */
  function watchAppEvents(): () => void {
    const offOpened = desktop().onEvent('app.opened', (payload) => {
      const p = payload as { appId?: string, instanceId?: string }
      if (p.appId && p.instanceId) { ensureTabFromEvent(p.appId, p.instanceId) }
    })
    const offClosed = desktop().onEvent('app.closed', (payload) => {
      const p = payload as { appId?: string, instanceId?: string }
      const tab = tabs.value.find(t => t.instanceId === p.instanceId || t.appId === p.appId)
      if (tab) { closeTab(tab) }
    })
    return () => {
      offOpened()
      offClosed()
    }
  }

  function loadRecent() {
    try {
      recentIds.value = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as string[]
    }
    catch { recentIds.value = [] }
  }

  async function loadApps() {
    appList.value = await desktop().apps.list() as AppSummary[]
  }

  return {
    tabs,
    activeKey,
    activeTab,
    recentIds,
    appList,
    activate,
    openApp,
    closeTab,
    moveTab,
    watchAppEvents,
    loadRecent,
    loadApps,
  }
}
