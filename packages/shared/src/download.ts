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
