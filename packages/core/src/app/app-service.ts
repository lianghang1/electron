import type { AppInstance, DesktopConfig } from '@desktop/shared'
import type { EventBus } from '../event/event-bus'
import type { AppRegistry } from './app-registry'
import { randomUUID } from 'node:crypto'
import { DesktopError } from '@desktop/shared'

/**
 * 运行中 App 实例的生命周期：opening → opened → closing → closed。
 * 第一阶段一个 App 只保留一个活跃 Instance，但 instanceId 独立生成，
 * 模型上保留一个 App 多 Instance 的能力。
 */
export class AppService {
  private instances = new Map<string, AppInstance>()
  /** appId → 活跃 instanceId（第一阶段一个 App 一个活跃 Instance） */
  private activeByApp = new Map<string, string>()

  constructor(
    private readonly registry: AppRegistry,
    private readonly config: DesktopConfig,
    private readonly events: EventBus,
  ) {}

  /** 打开 App：校验定义与接入策略，返回打开中的实例（对同一 App 重复 open 复用实例） */
  async open(appId: string): Promise<AppInstance> {
    const manifest = this.registry.get(appId)
    if (!manifest)
      throw new DesktopError('APP_NOT_FOUND', `App not registered: ${appId}`)
    if (manifest.type === 'third-party' && !this.config.apps.allowThirdParty)
      throw new DesktopError('APP_NOT_ALLOWED', `Third-party app is not allowed: ${appId}`)

    const existingId = this.activeByApp.get(appId)
    if (existingId) {
      const existing = this.instances.get(existingId)
      if (existing && existing.state !== 'closed')
        return existing
    }

    const instance: AppInstance = {
      instanceId: randomUUID(),
      appId,
      state: 'opening',
      createdAt: Date.now(),
    }
    this.instances.set(instance.instanceId, instance)
    this.activeByApp.set(appId, instance.instanceId)
    return instance
  }

  /** Web 运行时就绪后由编排方（TabService）调用：opening → opened */
  markOpened(instanceId: string): void {
    const instance = this.instances.get(instanceId)
    if (!instance || instance.state === 'opened')
      return
    instance.state = 'opened'
    this.events.emit('app:opened', instance)
  }

  /** 关闭实例：第一阶段 Web 运行时由 TabService 同步销毁后再调到这里（closing 态留给未来异步关闭） */
  async close(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId)
    if (!instance || instance.state === 'closing' || instance.state === 'closed')
      return
    instance.state = 'closed'
    this.activeByApp.delete(instance.appId)
    this.events.emit('app:closed', instance)
  }

  get(instanceId: string): AppInstance | undefined {
    return this.instances.get(instanceId)
  }

  list(): AppInstance[] {
    return [...this.instances.values()]
  }
}
