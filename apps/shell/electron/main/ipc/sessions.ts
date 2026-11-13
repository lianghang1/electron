import type { AppService } from '@shell/app-runtime'
import type { PlatformKernel } from '@shell/kernel'
import type { AppSessionRegistry } from '@shell/kernel/session'
import { registerIpcDomain } from '@shell/bridge/handle'
import { sessionsDomain } from '@shell/shared/ipc'

export interface SessionsIpcDeps {
  apps: AppService
  appSessions: AppSessionRegistry
  kernel: PlatformKernel
}

/**
 * sessions 域注册：appId 为管理面显式参数（与账本反查身份双保险），
 * 目标必须是已注册应用——破坏性通道的第一行身份关卡。
 */
export function registerSessionsIpc(deps: SessionsIpcDeps): void {
  const assertRegisteredApp = (appId: string): void => {
    if (!deps.apps.list().some(r => r.manifest.id === appId)) { throw new Error(`应用未注册：${appId}`) }
  }
  registerIpcDomain(sessionsDomain, {
    clearCache: async (_e, appId) => {
      assertRegisteredApp(appId)
      await deps.appSessions.clearCache(appId)
      deps.kernel.ctx.events.emit('session.cleared', { appId, scope: 'cache' })
    },
    clearSiteData: async (_e, appId) => {
      assertRegisteredApp(appId)
      await deps.appSessions.clearSiteData(appId)
      deps.kernel.ctx.events.emit('session.cleared', { appId, scope: 'site-data' })
    },
  })
}
