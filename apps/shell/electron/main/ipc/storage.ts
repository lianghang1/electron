import type { PermissionService } from '@shell/app-runtime'
import type { AppKvStore } from '@shell/kernel'
import type { CallerRegistry } from '@shell/shared'
import { registerIpcDomain } from '@shell/bridge/handle'
import { storageDomain } from '@shell/shared/ipc'
import { authorized } from './caller'

export interface StorageIpcDeps {
  callers: CallerRegistry
  permissions: PermissionService
  appKv: AppKvStore
}

/** storage 域注册：App 隔离 KV——解析身份 + 校验 storage 权限，按 appId 分文件 */
export function registerStorageIpc(deps: StorageIpcDeps): void {
  registerIpcDomain(storageDomain, {
    get: async (e, key) => deps.appKv.get(await authorized(deps, e.sender.id, 'storage'), key),
    set: async (e, key, value) => { deps.appKv.set(await authorized(deps, e.sender.id, 'storage'), key, value) },
    remove: async (e, key) => { deps.appKv.remove(await authorized(deps, e.sender.id, 'storage'), key) },
    clear: async (e) => { deps.appKv.clear(await authorized(deps, e.sender.id, 'storage')) },
    keys: async e => deps.appKv.keys(await authorized(deps, e.sender.id, 'storage')),
    snapshot: async e => deps.appKv.snapshot(await authorized(deps, e.sender.id, 'storage')),
  })
}
