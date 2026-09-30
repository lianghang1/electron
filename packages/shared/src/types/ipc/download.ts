/**
 * 下载域契约：任务列表推送 + 浮层面板的文件操作（打开 / 定位）。
 * 文件操作仅 Shell 与浮层窗可调用（Main 按 sender 校验），按 taskId 间接寻址。
 */
import type { DownloadTask } from '../download'

export type DownloadIpc = {
  /** 下载任务列表变化（开始 / 进度 / 完成 / 中断）后推送全量列表 */
  'download:updated': [DownloadTask[]]
  /** 用系统默认程序打开已完成的下载文件 */
  'download:open': (taskId: string) => void
  /** 在资源管理器中定位已完成的下载文件 */
  'download:reveal': (taskId: string) => void
  /** 关闭某条下载任务的通知卡片（仅隐藏展示，不影响任务本身） */
  'download:dismiss': (taskId: string) => void
}
