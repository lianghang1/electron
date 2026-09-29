import type { DownloadService } from '../download/download-service'
import type { OverlayWindowService } from '../window/overlay-window'
import type { CallerResolver } from './caller-context'
import { DesktopError } from '@desktop/shared'
import { handle } from './handle'

export interface OverlayIpcDeps {
  overlayService: OverlayWindowService
  /** 下载管理：面板关闭时同步清空任务展示 */
  downloadService: DownloadService
  resolver: CallerResolver
}

/**
 * 浮层域通道注册：全部仅接受浮层窗口自身回传（消息窗 toast/下载、弹窗窗授权决策），
 * Main 按窗口身份分发；Shell / App 无权调用（Tab 右键菜单已回归 Shell DOM，不走浮层窗）。
 */
export function registerOverlayIpc(deps: OverlayIpcDeps): void {
  // 浮层页面量高回报：Main 据此调整对应浮层窗尺寸与锚定位置
  handle('overlay:resize', (e, height) => {
    deps.overlayService.applyResize(e.sender, height)
  })
  // 浮层页 mounted 后主动拉取当前状态（按窗口身份分发，杜绝跨窗状态污染）
  handle('overlay:sync', (e) => {
    if (!deps.overlayService.isOverlay(e.sender)) {
      throw new DesktopError('PERMISSION_DENIED', 'This channel is overlay-only')
    }
    return deps.overlayService.syncFor(e.sender)
  })
  // 消息窗用户主动关闭面板：清空通知与面板显示；下载任务展示同步清空（进行中的下载继续）
  handle('overlay:dismiss', (e) => {
    if (!deps.overlayService.isOverlay(e.sender))
      return
    deps.overlayService.dismissPanel(e.sender)
    deps.downloadService.clearUI()
  })
  // 消息窗鼠标穿透切换（按窗口身份生效，弹窗窗不参与）
  handle('overlay:ignoreMouse', (e, ignore) => {
    deps.overlayService.setPanelMouseIgnore(e.sender, ignore === true)
  })
}
