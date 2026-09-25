import { session } from 'electron'

/** Session 创建通知监听器：App 首次取得 Session 时回调（缓存命中不触发） */
type SessionCreatedListener = (appId: string, appSession: Electron.Session) => void

/**
 * App 级 Session 隔离：每个 App 独立 partition（persist:app-<appId>），
 * Cookie / LocalStorage / Cache 等互不可见。Session 持久化，App 重开保留登录态。
 */
export class SessionService {
  private readonly createdListeners = new Set<SessionCreatedListener>()

  getSession(appId: string): Electron.Session {
    const appSession = session.fromPartition(`persist:app-${appId}`)
    for (const listener of this.createdListeners)
      listener(appId, appSession)
    return appSession
  }

  /** 订阅 Session 创建事件（下载 guard 等按 Session 挂载的能力使用） */
  onCreated(listener: SessionCreatedListener): () => void {
    this.createdListeners.add(listener)
    return () => {
      this.createdListeners.delete(listener)
    }
  }

  /** 清空 App 的会话数据（登出 / 重置场景），第一阶段仅提供能力不接 UI */
  async destroySession(appId: string): Promise<void> {
    await this.getSession(appId).clearStorageData()
  }
}
