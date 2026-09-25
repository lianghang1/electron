import type { CallerContext, Permission } from '@desktop/shared'
import type { AppRegistry } from '../app/app-registry'
import type { EventBus } from '../event/event-bus'
import type { Logger } from '../logger/logger'
import { DesktopError, PERMISSIONS } from '@desktop/shared'
import { SHELL_APP_ID } from '../constants'

/**
 * 权限的唯一授权方：check / assert 都只在 Main 进程执行。
 * Shell 是平台自身，全量放行；普通 App 按 manifest.permissions 判定。
 */
export class PermissionService {
  constructor(
    private readonly registry: AppRegistry,
    private readonly events: EventBus,
    private readonly logger: Logger,
  ) {}

  check(context: CallerContext, permission: Permission): boolean {
    if (context.appId === SHELL_APP_ID)
      return true
    return this.registry.get(context.appId)?.permissions?.includes(permission) ?? false
  }

  /** 校验失败即抛出：Main 内部服务调用系统操作前的强制关卡 */
  assert(context: CallerContext, permission: Permission): void {
    if (this.check(context, permission))
      return
    this.events.emit('permission:denied', { context, permission })
    this.logger.warn(`permission denied: ${permission}`, { appId: context.appId })
    throw new DesktopError('PERMISSION_DENIED', `Permission denied: ${permission}`, {
      appId: context.appId,
      permission,
    })
  }

  getPermissions(appId: string): Permission[] {
    if (appId === SHELL_APP_ID)
      return [...PERMISSIONS]
    return [...(this.registry.get(appId)?.permissions ?? [])]
  }
}
