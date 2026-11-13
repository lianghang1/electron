import type { PermissionService } from '@shell/app-runtime'
import type { CallerRegistry } from '@shell/shared'
import { registerIpcDomain } from '@shell/bridge/handle'
import { SHELL_APP_ID } from '@shell/shared'
import { permissionsDomain } from '@shell/shared/ipc'
import { callerOf } from './caller'

export interface PermissionsIpcDeps {
  callers: CallerRegistry
  permissions: PermissionService
}

/**
 * permissions 域注册：查询只做展示不弹窗；request 打开原生浮层询问，结论持久化；
 * reset 是工作台的管理动作。
 */
export function registerPermissionsIpc(deps: PermissionsIpcDeps): void {
  registerIpcDomain(permissionsDomain, {
    query: (e, permission) => {
      const caller = callerOf(deps.callers, e.sender.id)
      return deps.permissions.check({ appId: caller.appId, origin: `app://${caller.appId}`, permission })
    },
    list: (e, appId) => deps.permissions.listStates(appId ?? callerOf(deps.callers, e.sender.id).appId),
    request: (e, permission) => {
      const caller = callerOf(deps.callers, e.sender.id)
      return deps.permissions.requestRuntime({ appId: caller.appId, origin: `app://${caller.appId}`, permission })
    },
    reset: async (e, permission) => {
      if (callerOf(deps.callers, e.sender.id).appId !== SHELL_APP_ID) { throw new Error('仅工作台可重置授权') }
      await deps.permissions.resetRuntime(permission)
    },
  })
}
