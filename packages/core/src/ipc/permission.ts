import type { PermissionService } from '../permission/permission-service'
import type { CallerResolver } from './caller-context'
import { assertShell } from './caller-context'
import { handle } from './handle'

export interface PermissionIpcDeps {
  permissionService: PermissionService
  resolver: CallerResolver
}

/**
 * permission 域通道注册：权限状态查询，仅用于 UI 展示，实际授权以 Main 的 assert 为准。
 * 运行时授权弹窗的决策回传与挂起推送见 permissionDialog 域（弹窗窗专属）。
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
}
