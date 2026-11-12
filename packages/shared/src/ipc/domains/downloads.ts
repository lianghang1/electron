import type { DownloadTask } from '../../download'
import type { IpcDefs, IpcDomainValue } from '../contract'
import { defineIpcDomain, invoke } from '../contract'

/**
 * 下载任务域契约：按 taskId 间接寻址，页面无法用任意路径触达文件系统。
 */
export const downloadsDomain = defineIpcDomain('downloads', {
  list: invoke<() => DownloadTask[]>(),
  cancel: invoke<(taskId: string) => void>(),
  open: invoke<(taskId: string) => void>(),
  reveal: invoke<(taskId: string) => void>(),
  /** 移出通知/列表展示（不删文件） */
  dismiss: invoke<(taskId: string) => void>(),
}) satisfies IpcDomainValue<'downloads', IpcDefs>
