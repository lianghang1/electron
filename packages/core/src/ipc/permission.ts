import type { PermissionService } from '../permission/permission-service'
import type { OverlayWindowService } from '../window/overlay-window'
import type { CallerResolver } from './caller-context'
import { DesktopError } from '@desktop/shared'
import { assertShell } from './caller-context'
import { handle } from './handle'

export interface PermissionIpcDeps {
  permissionService: PermissionService
  /** respond 决策回传的弹窗窗身份校验 */
  overlayService: OverlayWindowService
  resolver: CallerResolver
}

/**
 * permission 域通道注册：权限状态查询，仅用于 UI 展示，实际授权以 Main 的 assert 为准。
 * respond 是运行时授权弹窗（浮层窗）的决策回传，仅弹窗窗身份有效。
 */
export function registerPermissionIpc(deps: PermissionIpcDeps): void {
  handle('permission:check', (e, permission) =>
    deps.permissionService.check(deps.resolver.resolve(e.sender), permission))
  handle('permission:list', (_e, appId) => deps.permissionService.listPermissionStates(appId))
  // 撤销决策是 Shell 用户的管理动作（应用中心「重置授权」）
  handle('permission:reset', (e, appId) => {
    assertShell(deps.resolver.resolve(e.sender))
    deps.permissionService.resetRuntime(appId)
  })
  // 弹窗窗回传：用户对运行时权限请求的决策（Main 落库并刷新挂起列表推送）
  handle('permission:respond', (e, input) => {
    if (!deps.overlayService.isOverlay(e.sender)) {
      throw new DesktopError('PERMISSION_DENIED', 'This channel is overlay-only')
    }
    const requestId = input?.requestId
    if (typeof requestId !== 'string' || !requestId) { throw new DesktopError('IPC_ERROR', 'invalid permission request id') }
    deps.permissionService.respond(requestId, input.granted === true)
  })
}
