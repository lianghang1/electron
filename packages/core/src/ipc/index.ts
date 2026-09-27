import type { DesktopConfig } from '@desktop/shared'
import type { AppRegistry } from '../app/app-registry'
import type { AppService } from '../app/app-service'
import type { PermissionService } from '../permission/permission-service'
import type { StorageService } from '../storage/storage-service'
import type { TabService } from '../tab/tab-service'
import type { AsarUpdateService } from '../updater/asar-update-service'
import type { UpdateService } from '../updater/update-service'
import type { WebService } from '../web/web-service'
import type { CallerResolver } from './caller-context'
import { registerAppIpc } from './app'
import { registerPermissionIpc } from './permission'
import { registerStorageIpc } from './storage'
import { registerTabsIpc } from './tabs'
import { registerUpdateIpc } from './update'
import { registerWindowIpc } from './window'

export interface PlatformIpcDeps {
  config: DesktopConfig
  registry: AppRegistry
  /** features.tabs = false 时为空：Tab 体系整体不启用 */
  appService?: AppService
  tabService?: TabService
  webService?: WebService
  storageService: StorageService
  permissionService: PermissionService
  /** updates.url 未配置时为空：整包更新通道不注册 */
  updateService?: UpdateService
  /** updates.asar 未配置时为空：asar 热更通道不注册 */
  asarService?: AsarUpdateService
  resolver: CallerResolver
}

/**
 * 平台 IPC 注册编排：每行一个能力域，契约与实现在本目录同名文件一一对应
 * （window.ts / tabs.ts / ... ↔ shared/types/ipc/ 同名契约）。
 * 新增能力 = 新建域文件（抄任意现有域结构）+ 这里加一行；
 * 条件启用（Tab 未装配 / 更新未配置）由各域文件自行判断。
 */
export function registerPlatformIpc(deps: PlatformIpcDeps): void {
  registerWindowIpc()
  registerAppIpc({
    config: deps.config,
    registry: deps.registry,
    appService: deps.appService,
    permissionService: deps.permissionService,
    resolver: deps.resolver,
  })
  registerTabsIpc({ tabService: deps.tabService, webService: deps.webService, resolver: deps.resolver })
  registerPermissionIpc({ permissionService: deps.permissionService, resolver: deps.resolver })
  registerStorageIpc({ storageService: deps.storageService, permissionService: deps.permissionService, resolver: deps.resolver })
  registerUpdateIpc({ updateService: deps.updateService, asarService: deps.asarService })
}
