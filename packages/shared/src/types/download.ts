/** 下载任务状态 */
export type DownloadTaskStatus = 'progressing' | 'completed' | 'cancelled' | 'interrupted'

/** 下载任务（Main → Shell 推送负载，全量列表推送） */
export interface DownloadTask {
  id: string
  appId: string
  /** 文件名（保存文件名） */
  filename: string
  /** 保存绝对路径（completed 后可用） */
  path: string
  /** 已接收字节数 */
  received: number
  /** 总字节数（未知为 0） */
  total: number
  /** 0-100，未知为 -1 */
  percent: number
  status: DownloadTaskStatus
  startedAt: number
}
