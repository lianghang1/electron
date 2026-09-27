import type { WebContents } from 'electron'
import type { PermissionService } from '../permission/permission-service'
import type { StorageService } from '../storage/storage-service'
import type { CallerResolver } from './caller-context'
import { handle } from './handle'

export interface StorageIpcDeps {
  storageService: StorageService
  permissionService: PermissionService
  resolver: CallerResolver
}

/**
 * 存储域通道注册：解析身份 + 校验 storage 权限后按 App 隔离读写。
 */
export function registerStorageIpc(deps: StorageIpcDeps): void {
  /** storage:* 通道的统一入口：解析身份 + 校验 storage 权限 */
  const authorized = (sender: WebContents) => {
    const context = deps.resolver.resolve(sender)
    deps.permissionService.assert(context, 'storage')
    return context
  }

  handle('storage:get', (e, key) => deps.storageService.get(authorized(e.sender), key))
  handle('storage:set', (e, key, value) =>
    deps.storageService.set(authorized(e.sender), key, value))
  handle('storage:remove', (e, key) => deps.storageService.remove(authorized(e.sender), key))
  handle('storage:clear', e => deps.storageService.clear(authorized(e.sender)))
}
