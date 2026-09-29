import type { PermissionService } from '../permission/permission-service'
import type { CallerResolver } from './caller-context'
import { assertShell } from './caller-context'
import { handle } from './handle'

export interface PermissionIpcDeps {
  permissionService: PermissionService
  resolver: CallerResolver
}

/**
 * 权限域通道注册：仅用于 UI 展示，实际授权以 Main 的 assert 为准。
 */
export function registerPermissionIpc(deps: PermissionIpcDeps): void {
  handle('permission:check', (e, permission) =>
    deps.permissionService.check(deps.resolver.resolve(e.sender), permission))
  handle('permission:list', (_e, appId) => deps.permissionService.listPermissionStates(appId))
  // 决策回传是 Shell 的职责：只有 Shell 用户能对运行时授权表态
  handle('permission:respond', (e, requestId, granted) => {
    assertShell(deps.resolver.resolve(e.sender))
    deps.permissionService.respond(requestId, granted)
  })
  // 撤销决策同样是 Shell 用户的管理动作（应用中心「重置授权」）
  handle('permission:reset', (e, appId) => {
    assertShell(deps.resolver.resolve(e.sender))
    deps.permissionService.resetRuntime(appId)
  })
}
