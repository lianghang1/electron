import type { EventBus } from '../event-bus'
import type { Startable } from '../lifecycle'
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** 产物生产者：只声明目录与保留期，清理器不认识业务名（master 写死三目录，此处改为注册制） */
export interface RetentionProducer {
  readonly id: string
  readonly dir: () => string
  readonly maxAgeMs: number
  /** 只清理匹配的文件名；缺省清理目录下全部文件（不递归子目录） */
  readonly match?: (name: string) => boolean
}

export interface RetentionReport {
  producer: string
  removed: number
  bytes: number
}

export interface RetentionOptions {
  events: EventBus
  /** 巡检间隔，默认 24h；0 = 只做启动清理 */
  intervalMs?: number
  now?: () => number
}

/**
 * 过期产物清理：审计日志、下载暂存、打印归档、cookie 快照、拍摄产物等生产者注册，
 * 清理器按 mtime 与保留期统一处理。启动即清一次，随后定时巡检。
 */
export class RetentionRegistry implements Startable {
  readonly name = 'retention'
  private readonly producers: RetentionProducer[] = []
  private timer?: NodeJS.Timeout

  constructor(private readonly options: RetentionOptions) {}

  register(producer: RetentionProducer): void {
    if (this.producers.some(p => p.id === producer.id)) {
      throw new Error(`retention producer already registered: ${producer.id}`)
    }
    this.producers.push(producer)
  }

  async start(): Promise<void> {
    await this.runOnce()
    const interval = this.options.intervalMs ?? 24 * 60 * 60 * 1000
    if (interval > 0) {
      this.timer = setInterval(() => void this.runOnce(), interval)
      this.timer.unref?.()
    }
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = undefined
    }
  }

  async runOnce(): Promise<RetentionReport[]> {
    const now = this.options.now?.() ?? Date.now()
    const reports: RetentionReport[] = []
    for (const producer of this.producers) {
      const dir = producer.dir()
      if (!existsSync(dir)) { continue }
      let removed = 0
      let bytes = 0
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isFile() || (producer.match && !producer.match(entry.name))) { continue }
        const file = join(dir, entry.name)
        try {
          const info = statSync(file)
          if (now - info.mtimeMs <= producer.maxAgeMs) { continue }
          rmSync(file, { force: true })
          removed++
          bytes += info.size
        }
        catch {
          // 单文件被占用或已删除不影响其它产物清理
        }
      }
      reports.push({ producer: producer.id, removed, bytes })
    }
    this.options.events.emit('retention.cleaned', { reports })
    return reports
  }
}
