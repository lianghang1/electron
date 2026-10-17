import type { PermissionService } from '../permission/permission-service'
import type { OverlayWindowService } from '../window/overlay-window'
import { DesktopError } from '@desktop/shared'
import { handle } from './handle'

export interface PermissionDialogIpcDeps {
  overlayService: OverlayWindowService
  permissionService: PermissionService
}

/**
 * permissionDialog 域通道注册：运行时授权弹窗窗专属（原 permission 域决策回传迁入）。
 * 决策回传仅接受浮层窗（域挂载兜底 + isOverlay 双保险）；状态查询仅弹窗窗自身。
 */
export function registerPermissionDialogIpc(deps: PermissionDialogIpcDeps): void {
  // 弹窗窗回传：用户对运行时权限请求的决策（Main 落库并刷新挂起列表推送）
  handle('permissionDialog:respond', (e, requestId, granted) => {
    if (!deps.overlayService.isOverlay(e.sender)) {
      throw new DesktopError('PERMISSION_DENIED', 'This channel is overlay-only')
    }
    if (typeof requestId !== 'string' || !requestId) { throw new DesktopError('IPC_ERROR', 'invalid permission request id') }
    deps.permissionService.respond(requestId, granted === true)
  })
  // 弹窗窗 mounted 后拉取挂起中的授权请求（对账推送竞态）
  handle('permissionDialog:sync', (e) => {
    if (!deps.overlayService.isOverlay(e.sender)) {
      throw new DesktopError('PERMISSION_DENIED', 'This channel is overlay-only')
    }
    return deps.overlayService.syncDialogs(e.sender)
  })
}
