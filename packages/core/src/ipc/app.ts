import type { AppContext, CallerContext, DesktopConfig } from '@desktop/shared'
import type { AppRegistry } from '../app/app-registry'
import type { AppService } from '../app/app-service'
import type { PermissionService } from '../permission/permission-service'
import type { CallerResolver } from './caller-context'
import { SHELL_APP_ID } from '../constants'
import { assertShell } from './caller-context'
import { handle } from './handle'

export interface AppIpcDeps {
  config: DesktopConfig
  registry: AppRegistry
  appService?: AppService
  permissionService: PermissionService
  resolver: CallerResolver
}

/**
 * App 域通道注册：应用定义与调用者上下文。
 */
export function registerAppIpc(deps: AppIpcDeps): void {
  handle('app:list', () => deps.registry.list())
  handle('app:getManifest', (_e, appId) => deps.registry.get(appId))
  handle('app:getCurrent', e => buildAppContext(deps.resolver.resolve(e.sender), deps))
}

/** AppContext 组装：注册 App 查实例与权限；Shell 用平台配置合成身份 */
function buildAppContext(context: CallerContext, deps: AppIpcDeps): AppContext {
  const manifest = deps.registry.get(context.appId)
  if (!manifest) {
    assertShell(context)
    return {
      appId: SHELL_APP_ID,
      instanceId: context.instanceId,
      manifest: {
        id: SHELL_APP_ID,
        name: deps.config.app.name,
        version: deps.config.app.version,
        type: 'internal',
        entry: { type: 'web', url: '' },
      },
      permissions: deps.permissionService.getPermissions(SHELL_APP_ID),
      createdAt: Date.now(),
    }
  }
  const instance = deps.appService?.get(context.instanceId)
  return {
    appId: manifest.id,
    instanceId: context.instanceId,
    manifest,
    permissions: deps.permissionService.getPermissions(manifest.id),
    createdAt: instance?.createdAt ?? Date.now(),
  }
}
