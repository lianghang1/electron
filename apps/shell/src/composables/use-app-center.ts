import type { Ref } from 'vue'
import type { AppSummary } from './use-shell-tabs'
import { shell } from '@shell/bridge/client'
import { computed, nextTick, ref, watch } from 'vue'

/**
 * 应用中心检索态：过滤按名称与 appId，↑↓ 移动选中；打开动作由组件层
 * emit 上抛（组件不直接碰桥）。表面挂载即呈现：清单与运行态在挂载时
 * 拉取（plane 常驻不能只在构建期取一次）。最近使用由壳页发起时经
 * present payload 注入——plane 是独立持久分区（persist:overlay-window），
 * 读不到壳窗 localStorage，跨分区数据只能走表面载荷。
 */
export function useAppCenter(recentIds: Ref<string[]>) {
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

  /** 最近使用：检索时隐藏，只保留仍在当前清单中的应用 */
  const recentApps = computed<AppSummary[]>(() => {
    if (searchQuery.value.trim()) { return [] }
    return recentIds.value
      .map(id => apps.value.find(a => a.manifest.id === id))
      .filter((a): a is AppSummary => a !== undefined)
  })

  const restApps = computed<AppSummary[]>(() => {
    const recentSet = new Set(recentApps.value.map(a => a.manifest.id))
    return filteredApps.value.filter(a => !recentSet.has(a.manifest.id))
  })

  /** 键盘导航扁平序列：最近使用在前、其余应用在后，与面板分区顺序一致 */
  const flatApps = computed<AppSummary[]>(() => [...recentApps.value, ...restApps.value])

  watch(searchQuery, () => { activeIdx.value = 0 })

  /** 呈现准备：重置检索态并聚焦搜索框（组件挂载时调用，下次呈现重新挂载） */
  async function reset(): Promise<void> {
    searchQuery.value = ''
    activeIdx.value = 0
    await nextTick()
    searchInput.value?.focus()
  }

  async function loadApps(): Promise<void> {
    try {
      apps.value = await shell().apps.list() as AppSummary[]
      runningIds.value = await shell().apps.running() as string[]
    }
    catch { apps.value = [] }
  }

  /** 键盘导航：↑↓ 移动选中；返回是否已消费按键（Enter/Escape 归组件层语义） */
  function navigate(e: KeyboardEvent): boolean {
    if (!flatApps.value.length) { return false }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      activeIdx.value = Math.min(activeIdx.value + 1, flatApps.value.length - 1)
      return true
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      activeIdx.value = Math.max(activeIdx.value - 1, 0)
      return true
    }
    return false
  }

  return { apps, runningIds, searchQuery, searchInput, activeIdx, recentApps, restApps, flatApps, loadApps, reset, navigate }
}
