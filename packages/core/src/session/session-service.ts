import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { app, session } from 'electron'
import { cookiesDir } from '../storage/app-paths'

/** Session 创建通知监听器：App 首次取得 Session 时回调（缓存命中不触发） */
type SessionCreatedListener = (appId: string, appSession: Electron.Session) => void

/** 持久化的 cookie 快照结构（与 Electron CookiesSetDetails 对齐的最小集） */
interface StoredCookie {
  url: string
  name: string
  value: string
  domain?: string
  path?: string
  secure?: boolean
  httpOnly?: boolean
  expirationDate?: number
  sameSite?: 'unspecified' | 'no_restriction' | 'lax' | 'strict'
}

/**
 * App 级 Session 隔离：每个 App 独立 partition（persist:app-<appId>），
 * Cookie / LocalStorage / Cache 等互不可见。Session 持久化，App 重开保留登录态。
 *
 * Cookie 快照垫片：Chromium 不把**会话 cookie**（无过期时间）写盘，重启后即丢——
 * 依赖 session cookie 维持登录态的站点（如 fsy）会"关闭应用后回到登录页"。
 * 这里在退出前把分区全部 cookie（含会话 cookie）快照到 userData，下次启动回放：
 * 持久 cookie 原样恢复，会话 cookie 回放为本轮内的会话 cookie，每轮退出再快照——
 * 登录态由此跨重启延续，直到站点自身使登出（cookie 被清除，快照随之清空）。
 */
export class SessionService {
  private readonly createdListeners = new Set<SessionCreatedListener>()
  /** 已做过启动回放的分区（每轮启动一次） */
  private readonly restoredPartitions = new Set<string>()
  private readonly cookiesFileFor = (appId: string) =>
    path.join(cookiesDir(), `app-${appId}-cookies.json`)

  constructor() {
    // 退出前快照：will-quit 时窗口仍在、Cookie 管理器数据完整
    app.on('will-quit', () => {
      void this.dumpAll()
    })
  }

  getSession(appId: string): Electron.Session {
    const appSession = session.fromPartition(`persist:app-${appId}`)
    for (const listener of this.createdListeners) { listener(appId, appSession) }
    void this.restoreCookies(appId, appSession)
    return appSession
  }

  /** 订阅 Session 创建事件（下载 guard 等按 Session 挂载的能力使用） */
  onCreated(listener: SessionCreatedListener): () => void {
    this.createdListeners.add(listener)
    return () => {
      this.createdListeners.delete(listener)
    }
  }

  /** 清空 App 的会话数据（登出 / 重置场景），清完立即重新快照空集（避免旧快照复活） */
  async destroySession(appId: string): Promise<void> {
    await this.getSession(appId).clearStorageData()
    await this.dumpCookies(appId)
  }

  private async restoreCookies(appId: string, appSession: Electron.Session): Promise<void> {
    const key = `persist:app-${appId}`
    if (this.restoredPartitions.has(key)) { return }
    this.restoredPartitions.add(key)
    try {
      const file = this.cookiesFileFor(appId)
      if (!existsSync(file)) { return }
      const stored = JSON.parse(readFileSync(file, 'utf-8')) as StoredCookie[]
      for (const cookie of stored) {
        // 单条失败不阻断整批（站点侧域属性变化等个别异常可容忍）
        await appSession.cookies.set(cookie).catch(() => {})
      }
    }
    catch (error) {
      // 快照损坏按无快照处理：站点走正常登录流程
      console.warn(`[session] cookie restore failed for ${appId}:`, error)
    }
  }

  private async dumpAll(): Promise<void> {
    for (const key of this.restoredPartitions) {
      const appId = key.replace(/^persist:app-/, '')
      await this.dumpCookies(appId).catch(() => {})
    }
  }

  private async dumpCookies(appId: string): Promise<void> {
    const appSession = session.fromPartition(`persist:app-${appId}`)
    const cookies = await appSession.cookies.get({})
    const stored: StoredCookie[] = cookies.map((cookie) => {
      const protocol = cookie.secure ? 'https' : 'http'
      const host = cookie.domain?.startsWith('.') ? cookie.domain.slice(1) : cookie.domain ?? ''
      const url = `${protocol}://${host}${cookie.path || '/'}`
      return {
        url,
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        expirationDate: cookie.expirationDate,
        sameSite: cookie.sameSite,
      }
    })
    // 快照目录无其他创建方（restore 只读、迁移仅在旧快照存在时建目录），写前必须确保存在
    const file = this.cookiesFileFor(appId)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(stored), 'utf-8')
  }
}
