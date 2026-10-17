import type { WebContents } from 'electron'
import type { AppRegistry } from '../app/app-registry'
import type { CacheService } from '../cache/cache-service'
import type { TabService } from '../tab/tab-service'
import type { CallerResolver } from './caller-context'
import { DesktopError } from '@desktop/shared'
import { assertShell } from './caller-context'
import { handle } from './handle'

export interface CacheIpcDeps {
  cacheService: CacheService
  registry: AppRegistry
  /** features.tabs = false 时为空：单应用形态清完站点数据后不自动重载 */
  tabService?: TabService
  resolver: CallerResolver
}

/**
 * 缓存清理域通道注册：Shell 专属管理动作（用户在平台 UI 里发起），
 * 目标容器由 Shell 显式指定，App 无权发起清理（更无权跨容器清理）。
 */
export function registerCacheIpc(deps: CacheIpcDeps): void {
  const shellOnly = (sender: WebContents, appId: string): void => {
    assertShell(deps.resolver.resolve(sender))
    if (!deps.registry.has(appId)) { throw new DesktopError('APP_NOT_FOUND', `App not registered: ${appId}`) }
  }

  handle('cache:clear', (e, appId) => {
    shellOnly(e.sender, appId)
    return deps.cacheService.clearCache(appId)
  })

  handle('cache:clearSite', async (e, appId) => {
    shellOnly(e.sender, appId)
    await deps.cacheService.clearSiteData(appId)
    // 站点数据清掉后登录态已失效：重载该容器全部 Tab，让内存中的 JS 状态一并复位
    for (const tab of deps.tabService?.list() ?? []) {
      if (tab.appId === appId) { deps.tabService?.reload(tab.id) }
    }
  })
}
