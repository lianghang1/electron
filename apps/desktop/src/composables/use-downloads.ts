import type { DownloadTask } from '@desktop/shared'
import { onBeforeUnmount, onMounted, ref } from 'vue'

/** 下载任务：订阅 Main 全量推送（开始 / 进度 / 完成 / 中断） */
export function useDownloads() {
  const tasks = ref<DownloadTask[]>([])
  let unsubscribe: (() => void) | null = null

  onMounted(() => {
    unsubscribe = window.desktop.events.on('download:updated', (list) => {
      tasks.value = list
    })
  })

  onBeforeUnmount(() => {
    unsubscribe?.()
  })

  return { tasks }
}

/** 字节数 → 可读大小 */
export function formatBytes(bytes: number): string {
  if (bytes <= 0)
    return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(units.length - 1, Math.floor(Math.log2(bytes) / 10))
  return `${(bytes / 2 ** (index * 10)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}
