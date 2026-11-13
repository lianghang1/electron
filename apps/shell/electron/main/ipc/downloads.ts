import type { DownloadManager } from '@shell/kernel/download'
import { registerIpcDomain } from '@shell/bridge/handle'
import { downloadsDomain } from '@shell/shared/ipc'

export interface DownloadsIpcDeps {
  downloads: DownloadManager
}

/** downloads 域注册：按 taskId 间接寻址，页面无法用任意路径触达文件系统 */
export function registerDownloadsIpc(deps: DownloadsIpcDeps): void {
  registerIpcDomain(downloadsDomain, {
    list: () => deps.downloads.list(),
    cancel: (_e, taskId) => deps.downloads.cancel(taskId),
    open: (_e, taskId) => deps.downloads.open(taskId),
    reveal: (_e, taskId) => deps.downloads.reveal(taskId),
    dismiss: (_e, taskId) => deps.downloads.dismiss(taskId),
  })
}
