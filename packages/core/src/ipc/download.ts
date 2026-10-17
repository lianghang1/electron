import type { DownloadService } from '../download/download-service'
import type { OverlayWindowService } from '../window/overlay-window'
import type { CallerResolver } from './caller-context'
import { assertShell } from './caller-context'
import { handle } from './handle'

export interface DownloadIpcDeps {
  downloadService: DownloadService
  overlayService: OverlayWindowService
  resolver: CallerResolver
}

/**
 * 下载操作域：打开文件 / 定位所在文件夹（浏览器级下载体验）。
 * 仅 Shell 与浮层窗可调用（overlay 窗注册 Shell 身份，assertShell 一并放行）；
 * 按 taskId 间接寻址——App 无法用任意路径触达文件系统。
 */
export function registerDownloadIpc(deps: DownloadIpcDeps): void {
  const shellOnly = (sender: Electron.WebContents): void => {
    assertShell(deps.resolver.resolve(sender))
  }

  handle('download:list', () => deps.downloadService.list())

  handle('download:open', (e, taskId) => {
    shellOnly(e.sender)
    return deps.downloadService.openFile(taskId)
  })

  handle('download:reveal', (e, taskId) => {
    shellOnly(e.sender)
    return deps.downloadService.revealFile(taskId)
  })

  handle('download:dismiss', (e, taskId) => {
    shellOnly(e.sender)
    deps.overlayService.dismissDownload(taskId)
  })
}
