import type { DesktopTab, OpenTabOptions } from '@desktop/shared'
import type { AppRegistry } from '../app/app-registry'
import type { AppService } from '../app/app-service'
import type { EventBus } from '../event/event-bus'
import type { Logger } from '../logger/logger'
import type { WebService } from '../web/web-service'
import { randomUUID } from 'node:crypto'
import { DesktopError } from '@desktop/shared'

/**
 * Tab 编排：open 一个 App = 确保 Instance → 建 Tab → 建 Web 运行时 → 激活。
 * Tab 模型只带可序列化数据，WebContents 通过 tabId 关联（见 WebService）。
 */
export class TabService {
  private tabs = new Map<string, DesktopTab>()

  constructor(
    private readonly registry: AppRegistry,
    private readonly appService: AppService,
    private readonly webService: WebService,
    private readonly events: EventBus,
    private readonly logger: Logger,
  ) {}

  list(): DesktopTab[] {
    return [...this.tabs.values()].map(tab => ({ ...tab }))
  }

  async open(options: OpenTabOptions): Promise<DesktopTab> {
    const manifest = this.registry.get(options.appId)
    if (!manifest) { throw new DesktopError('APP_NOT_FOUND', `App not registered: ${options.appId}`) }

    // 一个 App 同一时刻只保留一个 Tab：已打开则直接激活，避免重复创建
    const existing = [...this.tabs.values()].find(t => t.appId === options.appId)
    if (existing) {
      await this.activate(existing.id)
      this.logger.debug(`tab re-activated: ${options.appId}`, { tabId: existing.id })
      return { ...existing }
    }

    const instance = await this.appService.open(options.appId)
    const tab: DesktopTab = {
      id: randomUUID(),
      appId: manifest.id,
      instanceId: instance.instanceId,
      title: manifest.name,
      icon: manifest.icon,
      url: manifest.entry.url,
      active: false,
      closable: true,
      isLoading: true,
      createdAt: Date.now(),
    }
    this.tabs.set(tab.id, tab)
    this.events.emit('tab:created', tab)

    this.webService.create(
      { appId: tab.appId, instanceId: instance.instanceId, tabId: tab.id },
      manifest,
      isLoading => this.setLoading(tab.id, isLoading),
    )
    this.appService.markOpened(instance.instanceId)
    await this.activate(tab.id)
    this.logger.debug(`tab opened: ${tab.appId}`, { tabId: tab.id })
    return { ...tab }
  }

  async close(tabId: string): Promise<void> {
    const tab = this.getOrThrow(tabId)
    this.webService.destroy(tabId)
    this.tabs.delete(tabId)
    this.events.emit('tab:closed', tab)

    // 关掉的是当前激活 Tab → 激活最后一个剩余 Tab
    if (tab.active) {
      const remaining = [...this.tabs.values()]
      const next = remaining[remaining.length - 1]
      if (next) { await this.activate(next.id) }
    }

    // 该实例的所有 Tab 都已关闭 → 关闭 App 实例
    const hasInstanceTabs = [...this.tabs.values()].some(t => t.instanceId === tab.instanceId)
    if (!hasInstanceTabs) { await this.appService.close(tab.instanceId) }
  }

  async activate(tabId: string): Promise<void> {
    const tab = this.getOrThrow(tabId)
    for (const t of this.tabs.values()) { t.active = t.id === tabId }
    this.webService.focus(tabId)
    this.events.emit('tab:activated', tab)
  }

  async reload(tabId: string): Promise<void> {
    const tab = this.getOrThrow(tabId)
    this.webService.reload(tab.id)
  }

  private getOrThrow(tabId: string): DesktopTab {
    const tab = this.tabs.get(tabId)
    if (!tab) { throw new DesktopError('TAB_NOT_FOUND', `Tab not found: ${tabId}`) }
    return tab
  }

  /** Web 加载状态回写：去重后广播 tab:updated（Shell 推送桥转全量列表） */
  private setLoading(tabId: string, isLoading: boolean): void {
    const tab = this.tabs.get(tabId)
    if (!tab || tab.isLoading === isLoading) { return }
    tab.isLoading = isLoading
    this.events.emit('tab:updated', { ...tab })
  }
}
