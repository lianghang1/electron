/**
 * 下载域契约：下载管理无 invoke 面，只有 Main → Renderer 的任务列表推送。
 */
import type { DownloadTask } from '../download'

export type DownloadIpc = {
  /** 下载任务列表变化（开始 / 进度 / 完成 / 中断）后推送全量列表 */
  'download:updated': [DownloadTask[]]
}
