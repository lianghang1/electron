import type { DownloadTask } from '../download'
import { defineDomain, invoke, push } from '../../domain'

/**
 * 下载域契约：任务列表推送 + 浮层面板的文件操作（打开 / 定位）。
 * 文件操作仅 Shell 与浮层窗可调用（Main 按 sender 校验），按 taskId 间接寻址。
 */
export const downloadDomain = defineDomain('download', {
  /** 当前任务列表快照（创建时间倒序，先拉后推：页面先取快照再订阅 updated） */
  list: invoke<() => DownloadTask[]>(),

  // ---- Main → Renderer 推送 ----
  /** 下载任务列表变化（开始 / 进度 / 完成 / 中断）后推送全量列表 */
  updated: push<[DownloadTask[]]>(),

  /** 用系统默认程序打开已完成的下载文件 */
  open: invoke<(taskId: string) => void>(),
  /** 在资源管理器中定位已完成的下载文件 */
  reveal: invoke<(taskId: string) => void>(),
  /** 关闭某条下载任务的通知卡片（仅隐藏展示，不影响任务本身） */
  dismiss: invoke<(taskId: string) => void>(),
})
