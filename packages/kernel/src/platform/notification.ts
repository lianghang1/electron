import type { EventBus } from '../event-bus'
import type { Startable } from '../lifecycle'

export type NotificationLevel = 'info' | 'success' | 'warning' | 'error'

export interface PlatformNotification {
  id: string
  title: string
  body?: string
  level: NotificationLevel
  createdAt: number
  ttlMs: number
}

export interface NotificationInput {
  title: string
  body?: string
  level?: NotificationLevel
  ttlMs?: number
}

export interface NotificationOptions {
  events: EventBus
  defaultTtlMs?: number
  now?: () => number
}

/**
 * 消息通道唯一数据源：toast / 下载卡 / 通知中心共用一份列表与 TTL 计时器，
 * 宿主（原生浮层窗）只订阅 notification.updated，不各自维护定时器。
 */
export class NotificationCenter implements Startable {
  readonly name = 'notification'
  private items: PlatformNotification[] = []
  private readonly timers = new Map<string, NodeJS.Timeout>()
  private seq = 0

  constructor(private readonly options: NotificationOptions) {}

  async start(): Promise<void> {}
  async stop(): Promise<void> {
    for (const timer of this.timers.values()) { clearTimeout(timer) }
    this.timers.clear()
  }

  push(input: NotificationInput): string {
    const now = this.options.now?.() ?? Date.now()
    const id = `n-${++this.seq}-${now}`
    const ttlMs = input.ttlMs ?? this.options.defaultTtlMs ?? 8000
    this.items = [...this.items, { id, title: input.title, body: input.body, level: input.level ?? 'info', createdAt: now, ttlMs }]
    const timer = setTimeout(() => this.dismiss(id), ttlMs)
    timer.unref?.()
    this.timers.set(id, timer)
    this.emit()
    return id
  }

  dismiss(id: string): void {
    const timer = this.timers.get(id)
    if (timer) { clearTimeout(timer) }
    this.timers.delete(id)
    const next = this.items.filter(item => item.id !== id)
    if (next.length === this.items.length) { return }
    this.items = next
    this.emit()
  }

  clear(): void {
    this.items = []
    for (const timer of this.timers.values()) { clearTimeout(timer) }
    this.timers.clear()
    this.emit()
  }

  list(): readonly PlatformNotification[] {
    return this.items
  }

  private emit(): void {
    this.options.events.emit('notification.updated', { items: [...this.items] })
  }
}
