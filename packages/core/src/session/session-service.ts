import { session } from 'electron'

/**
 * App 级 Session 隔离：每个 App 独立 partition（persist:app-<appId>），
 * Cookie / LocalStorage / Cache 等互不可见。Session 持久化，App 重开保留登录态。
 */
export class SessionService {
  getSession(appId: string): Electron.Session {
    return session.fromPartition(`persist:app-${appId}`)
  }

  /** 清空 App 的会话数据（登出 / 重置场景），第一阶段仅提供能力不接 UI */
  async destroySession(appId: string): Promise<void> {
    await this.getSession(appId).clearStorageData()
  }
}
