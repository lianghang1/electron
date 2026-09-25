import type { EventBus, PlatformEventMap } from '../event/event-bus'
import type { Logger } from '../logger/logger'
import { appendFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

/** 审计留痕保留天数：超过后按天文件自动清理 */
const RETENTION_DAYS = 30

/** 单条审计记录：JSONL 一行一条，字段随事件类型扩展 */
interface AuditEntry {
  ts: string
  type: 'permission.denied' | 'permission.decided' | 'renderer.crashed' | 'app.opened' | 'app.closed'
  appId?: string
  detail?: Record<string, unknown>
}

/**
 * 审计日志：平台安全相关事件的 append-only 结构化留痕（userData/audit/，按天分文件）。
 * 与运行日志（electron-log，会轮转、含海量运行信息）分离——审计要求完整可追溯；
 * 事件量小（权限决策 / 崩溃 / App 生命周期），同步写保证退出前落盘，失败只告警不阻断业务。
 */
export class AuditService {
  private readonly dir: string
  private unsubscribers: Array<() => void> = []

  constructor(
    private readonly events: EventBus,
    private readonly logger: Logger,
    userDataPath: string,
  ) {
    this.dir = join(userDataPath, 'audit')
  }

  start(): void {
    this.cleanExpired()
    const on = <K extends keyof PlatformEventMap>(
      event: K,
      handler: (...args: PlatformEventMap[K]) => void,
    ): void => {
      this.unsubscribers.push(this.events.on(event, handler))
    }

    on('permission:denied', ({ context, permission }) => {
      this.write({
        type: 'permission.denied',
        appId: context.appId,
        detail: { permission, instanceId: context.instanceId },
      })
    })
    on('permission:decided', ({ appId, permission, granted }) => {
      this.write({ type: 'permission.decided', appId, detail: { permission, granted } })
    })
    on('renderer:crashed', ({ appId, reason }) => {
      this.write({ type: 'renderer.crashed', appId, detail: { reason } })
    })
    on('app:opened', (instance) => {
      this.write({ type: 'app.opened', appId: instance.appId, detail: { instanceId: instance.instanceId } })
    })
    on('app:closed', (instance) => {
      this.write({ type: 'app.closed', appId: instance.appId, detail: { instanceId: instance.instanceId } })
    })
  }

  dispose(): void {
    this.unsubscribers.forEach(unsubscribe => unsubscribe())
    this.unsubscribers = []
  }

  /** 清理超过保留期的按天文件（audit-YYYY-MM-DD.jsonl） */
  private cleanExpired(): void {
    try {
      if (!existsSync(this.dir))
        return
      const now = Date.now()
      for (const name of readdirSync(this.dir)) {
        const match = /^audit-(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(name)
        if (!match)
          continue
        if ((now - Date.parse(match[1])) / 86_400_000 > RETENTION_DAYS) {
          rmSync(join(this.dir, name))
          this.logger.info(`expired audit file removed: ${name}`)
        }
      }
    }
    catch (error) {
      this.logger.warn('audit retention cleanup failed', { error: String(error) })
    }
  }

  /** 同步追加写（量小，同步保证退出前落盘） */
  private write(entry: Omit<AuditEntry, 'ts'>): void {
    try {
      mkdirSync(this.dir, { recursive: true })
      const line = `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`
      appendFileSync(join(this.dir, `audit-${new Date().toISOString().slice(0, 10)}.jsonl`), line, 'utf8')
    }
    catch (error) {
      this.logger.error('audit write failed', { error: String(error) })
    }
  }
}
