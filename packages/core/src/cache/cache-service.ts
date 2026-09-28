import type { Logger } from '../logger/logger'
import type { SessionService } from '../session/session-service'

/** 「站点数据」覆盖面：对齐浏览器「Cookie 及其他站点数据」的清理清单 */
const SITE_STORAGES = ['cookies', 'localstorage', 'indexdb', 'cachestorage', 'serviceworkers', 'websql', 'filesystem', 'shadercache'] as const

/**
 * 缓存清理：按容器（App Session）清理可再生缓存与站点数据。
 * 只作用于指定 App 自己的 partition，平台其余容器与 Shell 不受影响。
 * App 的业务数据（storage:* → app-<appId>.json）不属于「缓存」，不在清理范围。
 */
export class CacheService {
  constructor(
    private readonly sessionService: SessionService,
    private readonly logger: Logger,
  ) {}

  /** 清可再生缓存（对应用户语义「清缓存」）：重新加载即重新下载，登录态不受影响 */
  async clearCache(appId: string): Promise<void> {
    await this.sessionService.getSession(appId).clearCache()
    this.logger.info('cache cleared', { appId })
  }

  /** 清站点数据（对应用户语义「清除 Cookie 及站点数据」）：容器内网页回到未登录状态 */
  async clearSiteData(appId: string): Promise<void> {
    await this.sessionService.getSession(appId).clearStorageData({ storages: [...SITE_STORAGES] })
    this.logger.info('site data cleared', { appId })
  }
}
