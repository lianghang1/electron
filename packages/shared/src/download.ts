/** 下载任务状态：progressing → 四种终态之一 */
export type DownloadTaskStatus = 'progressing' | 'completed' | 'cancelled' | 'failed' | 'interrupted'

/** 下载任务（主进程账本 → 渲染层横幅，纯数据可结构化克隆） */
export interface DownloadTask {
  id: string
  appId: string
  /** 已加固的保存文件名（不含目录） */
  filename: string
  /** 保存绝对路径；completed 后可用 */
  path: string
  received: number
  /** 总字节数，未知为 0 */
  total: number
  /** 0-100；总大小未知为 -1 */
  percent: number
  status: DownloadTaskStatus
  startedAt: number
  finishedAt?: number
  /** 终态原因：user / policy / interrupted / 错误信息 */
  reason?: string
}

/** 字节数人性化展示（下载卡总大小）：1024 进制，一位小数，B 档取整 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) { return '0 B' }
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exp = Math.min(Math.floor(Math.log2(bytes) / 10), units.length - 1)
  const value = bytes / 1024 ** exp
  return `${exp === 0 ? Math.round(value) : value.toFixed(1)} ${units[exp]}`
}
