import type { AppContext, CallerContext, DesktopConfig } from '@desktop/shared'
import type { IpcMainInvokeEvent, WebContents } from 'electron'
import type { AppRegistry } from '../app/app-registry'
import type { AppService } from '../app/app-service'
import type { PermissionService } from '../permission/permission-service'
import type { StorageService } from '../storage/storage-service'
import type { TabService } from '../tab/tab-service'
import type { AsarUpdateService } from '../updater/asar-update-service'
import type { UpdateService } from '../updater/update-service'
import type { WebService } from '../web/web-service'
import type { CallerResolver } from './caller-context'
import { DesktopError } from '@desktop/shared'
import { BrowserWindow } from 'electron'
import { SHELL_APP_ID } from '../constants'
import { handle } from './handle'

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

function winFrom(event: IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender)
}

/**
 * 注册平台全部 IPC。所有身份相关决策都基于 resolver.resolve(event.sender)，
 * 敏感通道（storage / setWorkArea）在入口处统一做权限与身份校验。
 */
export function registerPlatformIpc(deps: PlatformIpcDeps): void {
  // ---- 窗口：谁调用就操作谁的窗口 ----
  handle('window:minimize', e => winFrom(e)?.minimize())
  handle('window:maximize', e => winFrom(e)?.maximize())
  handle('window:restore', e => winFrom(e)?.unmaximize())
  handle('window:isMaximized', e => winFrom(e)?.isMaximized() ?? false)
  handle('window:close', e => winFrom(e)?.close())

  // ---- App ----
  handle('app:list', () => deps.registry.list())
  handle('app:getManifest', (_e, appId) => deps.registry.get(appId))
  handle('app:getCurrent', e => buildAppContext(deps.resolver.resolve(e.sender), deps))

  // ---- Tabs：仅在 features.tabs 启用时注册（单应用形态不暴露 Tab 通道） ----
  if (deps.tabService && deps.webService) {
    const { tabService, webService } = deps
    handle('tabs:list', () => tabService.list())
    handle('tabs:open', (_e, options) => tabService.open(options))
    handle('tabs:close', (_e, tabId) => tabService.close(tabId))
    handle('tabs:activate', (_e, tabId) => tabService.activate(tabId))
    handle('tabs:reload', (_e, tabId) => tabService.reload(tabId))
    // 容器区域只允许 Shell 声明，Web App 无权改 Shell 布局
    handle('tabs:setWorkArea', (e, rect) => {
      assertShell(deps.resolver.resolve(e.sender))
      webService.setWorkArea(rect)
    })
  }

  // ---- Permission：仅用于 UI 展示，实际授权以 Main 的 assert 为准 ----
  handle('permission:check', (e, permission) =>
    deps.permissionService.check(deps.resolver.resolve(e.sender), permission))
  handle('permission:list', (_e, appId) => deps.permissionService.listPermissionStates(appId))
  // 决策回传是 Shell 的职责：只有 Shell 用户能对运行时授权表态
  handle('permission:respond', (e, requestId, granted) => {
    assertShell(deps.resolver.resolve(e.sender))
    deps.permissionService.respond(requestId, granted)
  })

  // ---- Storage：解析身份 + 校验 storage 权限后按 App 隔离读写 ----
  handle('storage:get', (e, key) => deps.storageService.get(authorized(deps, e.sender), key))
  handle('storage:set', (e, key, value) =>
    deps.storageService.set(authorized(deps, e.sender), key, value))
  handle('storage:remove', (e, key) => deps.storageService.remove(authorized(deps, e.sender), key))
  handle('storage:clear', e => deps.storageService.clear(authorized(deps, e.sender)))

  // ---- Update：任一更新方式配置即注册；install 为统一入口（asar pending 优先） ----
  const { updateService, asarService } = deps
  if (updateService || asarService) {
    handle('update:check', () => {
      void asarService?.check()
      updateService?.check()
    })
    handle('update:install', () => {
      if (asarService?.hasPending()) {
        asarService.install()
        return
      }
      updateService?.install()
    })
  }
}

/** Shell 专属通道的身份关卡 */
function assertShell(context: CallerContext): void {
  if (context.appId !== SHELL_APP_ID) {
    throw new DesktopError('PERMISSION_DENIED', 'This channel is shell-only', {
      appId: context.appId,
    })
  }
}

/** storage:* 通道的统一入口：解析身份 + 校验 storage 权限 */
function authorized(deps: PlatformIpcDeps, sender: WebContents): CallerContext {
  const context = deps.resolver.resolve(sender)
  deps.permissionService.assert(context, 'storage')
  return context
}

/** AppContext 组装：注册 App 查实例与权限；Shell 用平台配置合成身份 */
function buildAppContext(context: CallerContext, deps: PlatformIpcDeps): AppContext {
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
