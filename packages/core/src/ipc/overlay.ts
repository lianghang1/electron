import type { OverlayWindowService } from '../window/overlay-window'
import { DesktopError } from '@desktop/shared'
import { handle } from './handle'

export interface OverlayIpcDeps {
  overlayService: OverlayWindowService
}

/**
 * overlay 域通道注册：消息窗（通知 toast / 下载通知卡）专属渲染与交互。
 * 授权弹窗 / Tab 右键菜单 / 拍摄浮层回传分别拆入 permissionDialog / menu / captureDialog 域。
 */
export function registerOverlayIpc(deps: OverlayIpcDeps): void {
  // 浮层页面量高回报：Main 据此调整对应浮层窗尺寸与锚定位置
  handle('overlay:resize', (e, height) => {
    deps.overlayService.applyResize(e.sender, height)
  })
  // 消息窗 mounted 后主动拉取当前状态（toast / 下载，杜绝推送早于订阅的竞态）
  handle('overlay:sync', (e) => {
    if (!deps.overlayService.isOverlay(e.sender)) {
      throw new DesktopError('PERMISSION_DENIED', 'This channel is overlay-only')
    }
    return deps.overlayService.syncPanel(e.sender)
  })
  // 消息窗鼠标穿透切换（按窗口身份生效，弹窗/菜单窗不参与）
  handle('overlay:ignoreMouse', (e, ignore) => {
    deps.overlayService.setPanelMouseIgnore(e.sender, ignore === true)
  })
}
