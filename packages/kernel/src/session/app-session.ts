import type { EventBus } from '../event-bus'
import type { Startable } from '../lifecycle'
import type { Logger } from '../logger'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app, session } from 'electron'
import { parseCookieSnapshot, serializeCookie } from './cookie-snapshot'

/** 站点数据覆盖面：对齐浏览器「Cookie 及其他站点数据」 */
const SITE_STORAGES = ['cookies', 'localstorage', 'indexdb', 'cachestorage', 'serviceworkers', 'filesystem', 'shadercache'] as const

export interface AppSessionRegistryOptions {
  logger: Logger
  events: EventBus
  cookiesDir: string
  /** 分区首次创建的接线点：协议注册、下载门控等由组合根注入，kernel 不认识上层能力 */
  onSessionCreated?: (ses: Electron.Session, appId: string) => void
}

/**
 * 应用会话容器：每个应用一个 persist:app-<id> 分区，Cookie / LocalStorage / Cache 互不可见。
 * 快照垫片补上 Chromium 不落盘会话 cookie 的缺口：退出前把分区全部 cookie 原子写入，
 * 下次启动逐条回放；清空站点数据后立刻重拍空集，避免旧快照把登录态复活。
 */
export class AppSessionRegistry implements Startable {
  readonly name = 'app-sessions'
  private readonly sessions = new Map<string, Electron.Session>()
  private readonly restored = new Set<string>()
  private quitting = false

  constructor(private readonly options: AppSessionRegistryOptions) {}

  /** 幂等取分区；首次创建时触发接线并回放 cookie */
  forApp(appId: string): Electron.Session {
    const existing = this.sessions.get(appId)
    if (existing) { return existing }
    const ses = session.fromPartition(`persist:app-${appId}`)
    this.sessions.set(appId, ses)
    this.options.onSessionCreated?.(ses, appId)
    void this.restoreCookies(appId, ses)
    return ses
  }

  /** 清可再生缓存：重新加载即重新下载，登录态不受影响 */
  async clearCache(appId: string): Promise<void> {
    await this.forApp(appId).clearCache()
  }

  /** 清站点数据：容器内网页回到未登录状态 */
  async clearSiteData(appId: string): Promise<void> {
    const ses = this.forApp(appId)
    await ses.clearStorageData({ storages: [...SITE_STORAGES] })
    await this.dumpCookies(appId, ses)
  }

  async destroySession(appId: string): Promise<void> {
    const ses = this.forApp(appId)
    await ses.clearStorageData()
    await this.dumpCookies(appId, ses)
  }

  async start(): Promise<void> {
    app.on('will-quit', this.onWillQuit)
  }

  async stop(): Promise<void> {
    app.removeListener('will-quit', this.onWillQuit)
    await this.dumpAll()
  }

  /**
   * will-quit 不等待异步写盘，直接 void 会丢快照：先阻止退出，
   * 落盘完成后再 quit；重入标记让第二次 will-quit 正常放行。
   */
  private readonly onWillQuit = (event: Electron.Event): void => {
    if (this.quitting) { return }
    this.quitting = true
    event.preventDefault()
    void this.dumpAll().finally(() => app.quit())
  }

  private cookieFile(appId: string): string {
    return join(this.options.cookiesDir, `app-${appId}-cookies.json`)
  }

  private async restoreCookies(appId: string, ses: Electron.Session): Promise<void> {
    if (this.restored.has(appId)) { return }
    this.restored.add(appId)
    const file = this.cookieFile(appId)
    if (!existsSync(file)) { return }
    try {
      const raw: unknown = JSON.parse(readFileSync(file, 'utf-8'))
      let count = 0
      for (const cookie of parseCookieSnapshot(raw)) {
        // 单条失败不阻断整批：站点侧域属性变化等个别异常可容忍
        await ses.cookies.set(cookie).then(() => { count++ }).catch(() => {})
      }
      this.options.events.emit('session.cookies-restored', { appId, count })
    }
    catch (err) {
      this.options.logger.warn('cookie 快照回放失败，站点走正常登录流程', { appId, error: String(err) })
    }
  }

  private async dumpAll(): Promise<void> {
    await Promise.all([...this.sessions].map(async ([appId, ses]) => {
      try { await this.dumpCookies(appId, ses) }
      catch (err) { this.options.logger.warn('cookie 快照落盘失败', { appId, error: String(err) }) }
    }))
  }

  /** 临时文件 + rename：退出时写到一半不会留下半截 JSON */
  private async dumpCookies(appId: string, ses: Electron.Session): Promise<void> {
    const cookies = await ses.cookies.get({})
    const stored = cookies.map(cookie => serializeCookie(cookie))
    const file = this.cookieFile(appId)
    mkdirSync(dirname(file), { recursive: true })
    const tmp = `${file}.tmp`
    writeFileSync(tmp, JSON.stringify(stored), 'utf-8')
    renameSync(tmp, file)
  }
}
