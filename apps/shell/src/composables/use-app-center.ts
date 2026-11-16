import type { AppSummary } from './use-shell-tabs'
import { shell } from '@shell/bridge/client'
import { computed, nextTick, ref, watch } from 'vue'

/**
 * 应用中心检索态：过滤按名称与 appId，↑↓ 移动选中；打开动作由组件层
 * emit 上抛（组件不直接碰桥）。表面挂载即呈现：清单与运行态在挂载时
 * 拉取（plane 常驻不能只在构建期取一次），检索态重置与聚焦同点触发。
 */
export function useAppCenter() {
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

  return { apps, runningIds, searchQuery, searchInput, activeIdx, filteredApps, loadApps, reset, navigate }
}
