import type { WebContents } from 'electron'
import type { OverlayWindowService } from '../window/overlay-window'
import type { CallerResolver } from './caller-context'
import { DesktopError } from '@desktop/shared'
import { assertShell } from './caller-context'
import { handle } from './handle'

export interface OverlayIpcDeps {
  overlayService: OverlayWindowService
  /** Shell 窗口获取器：浮层动作转发目标 */
  getShell: () => import('electron').BrowserWindow | undefined
  resolver: CallerResolver
}

/**
 * 浮层域通道注册：showMenu/hideMenu 为 Shell 专属（App 无权弹全局浮层）；
 * action 仅接受浮层窗口自身回传，Main 转发给 Shell 后自动收起。
 */
export function registerOverlayIpc(deps: OverlayIpcDeps): void {
  const shellOnly = (sender: WebContents): void => {
    assertShell(deps.resolver.resolve(sender))
  }

  handle('overlay:showMenu', (e, config) => {
    shellOnly(e.sender)
    deps.overlayService.showMenu(config)
  })
  handle('overlay:hideMenu', (e) => {
    shellOnly(e.sender)
    deps.overlayService.hide()
  })
  handle('overlay:action', (e, itemId) => {
    if (!deps.overlayService.isOverlay(e.sender))
      return
    deps.getShell()?.webContents.send('overlay:menuAction', itemId)
    deps.overlayService.hide()
  })
  // 浮层页面量高回报：Main 据此调整对应浮层窗尺寸与锚定位置
  handle('overlay:resize', (e, height) => {
    deps.overlayService.applyResize(e.sender, height)
  })
  // 浮层页 mounted 后主动拉取当前状态（杜绝 Main 推送早于页面订阅的竞态）
  handle('overlay:sync', (e) => {
    if (!deps.overlayService.isOverlay(e.sender)) {
      throw new DesktopError('PERMISSION_DENIED', 'This channel is overlay-only')
    }
    return deps.overlayService.syncState()
  })
}
