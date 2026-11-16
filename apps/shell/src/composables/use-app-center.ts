import type { AppSummary } from './use-shell-tabs'
import { shell } from '@shell/bridge/client'
import { ref, watch } from 'vue'

/**
 * 应用中心检索态：过滤按名称与 appId，↑↓ 移动选中；打开动作由组件层
 * emit 上抛（组件不直接碰桥）。应用清单与运行态按需拉取：plane 常驻，
 * 不能只在 mounted 拉一次（运行态会过期）。
 */
export function useAppCenter(isOpen: () => boolean) {
  const apps = ref<AppSummary[]>([])
  const runningIds = ref<string[]>([])
  const searchQuery = ref('')
  const searchInput = ref<HTMLInputElement | null>(null)
  const activeIdx = ref(0)

  const filteredApps = computed(() => {
    const q = searchQuery.value.trim().toLowerCase()
    if (!q) { return apps.value }
    return apps.value.filter(a =>
      a.manifest.name.toLowerCase().includes(q) || a.manifest.id.toLowerCase().includes(q))
  })

  watch(searchQuery, () => { activeIdx.value = 0 })

  /** 应用中心开关都以此为准归零检索态 */
  watch(isOpen, (isOpenNow) => {
    searchQuery.value = ''
    activeIdx.value = 0
    if (isOpenNow) { void nextTick(() => searchInput.value?.focus()) }
  })

  async function loadApps(): Promise<void> {
    try {
      apps.value = await shell().apps.list() as AppSummary[]
      runningIds.value = await shell().apps.running() as string[]
    }
    catch { apps.value = [] }
  }

  /** 键盘导航：↑↓ 移动选中；返回是否已消费按键（Enter/Escape 归组件层语义） */
  function navigate(e: KeyboardEvent): boolean {
    if (!filteredApps.value.length) { return false }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      activeIdx.value = Math.min(activeIdx.value + 1, filteredApps.value.length - 1)
      return true
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      activeIdx.value = Math.max(activeIdx.value - 1, 0)
      return true
    }
    return false
  }

  return { apps, runningIds, searchQuery, searchInput, activeIdx, filteredApps, loadApps, navigate }
}
