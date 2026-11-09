import type { PlatformEventName } from '@shell/shared'
import type { EventBus } from '../event-bus'
import type { Startable } from '../lifecycle'
import type { Logger } from '../logger'
import { appendFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

/** 落盘白名单：安全相关事件，排除高频进度类全量快照 */
export const AUDIT_EVENTS: ReadonlySet<PlatformEventName> = new Set([
  'permission.decided',
  'app.opened',
  'app.closed',
  'crash.renderer-gone',
  'watchdog.recovery-mode',
  'update.applied',
  'update.failed',
  'update.restart-required',
  'update.force-required',
  'download.completed',
  'download.cancelled',
  'download.failed',
  'session.cleared',
  'session.cookies-restored',
])

export function auditFileName(date: Date): string {
  return `audit-${date.toISOString().slice(0, 10)}.jsonl`
}

export function isAuditExpired(name: string, now: number, retentionDays: number): boolean {
  const match = /^audit-(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(name)
  if (!match) { return false }
  return (now - Date.parse(match[1])) / 86_400_000 > retentionDays
}

export interface AuditLogOptions {
  events: EventBus
  logger: Logger
  dir: string
  retentionDays?: number
  now?: () => Date
}

/**
 * 审计留痕：安全相关事件的 append-only JSONL，按天分文件。
 * 与运行日志分离（运行日志会轮转、含海量运行信息），同步写保证退出前落盘，
 * 失败只告警不阻断业务；事件白名单是数据，新增审计类型只改表。
 */
export class AuditLog implements Startable {
  readonly name = 'audit'
  private unsubscribe?: () => void
  private readonly now: () => Date
  private readonly retentionDays: number

  constructor(private readonly options: AuditLogOptions) {
    this.now = options.now ?? (() => new Date())
    this.retentionDays = options.retentionDays ?? 30
  }

  async start(): Promise<void> {
    this.cleanExpired()
    this.unsubscribe = this.options.events.onAny((event, payload) => {
      if (AUDIT_EVENTS.has(event)) { this.write(event, payload) }
    })
  }

  async stop(): Promise<void> {
    this.unsubscribe?.()
    this.unsubscribe = undefined
  }

  private write(event: PlatformEventName, payload: unknown): void {
    const now = this.now()
    const line = `${JSON.stringify({ ts: now.toISOString(), event, payload })}\n`
    try {
      mkdirSync(this.options.dir, { recursive: true })
      appendFileSync(join(this.options.dir, auditFileName(now)), line, 'utf8')
    }
    catch (err) {
      this.options.logger.error('审计写入失败', { error: String(err) })
    }
  }

  private cleanExpired(): void {
    try {
      if (!existsSync(this.options.dir)) { return }
      for (const name of readdirSync(this.options.dir)) {
        if (isAuditExpired(name, this.now().getTime(), this.retentionDays)) {
          rmSync(join(this.options.dir, name))
        }
      }
    }
    catch (err) {
      this.options.logger.warn('审计过期文件清理失败', { error: String(err) })
    }
  }
}
