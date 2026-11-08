import type { EventBus, Startable } from '@shell/kernel'
import type { AppInstance, AppManifest, RegisteredApp } from '@shell/shared'
import type { AppOpener } from './opener'
import { randomUUID } from 'node:crypto'

export class AppOpenError extends Error {
  constructor(public readonly code: 'APP_NOT_FOUND' | 'APP_NOT_ALLOWED' | 'NO_OPENER', message: string) {
    super(message)
  }
}

/**
 * AppService：应用运行时。持有注册表与活跃实例，经 AppOpener SPI 分发——
 * 不 import 任何具体形态、不认识窗口；新增形态零改动。
 * openers / events 由组合根注入。
 */
export class AppService implements Startable {
  readonly name = 'apps'
  private registry = new Map<string, RegisteredApp>()
  private instances = new Map<string, AppInstance>()
  private activeByApp = new Map<string, string>()

  constructor(
    private readonly admit: (manifest: AppManifest) => boolean | Promise<boolean>,
    private readonly openers: AppOpener[],
    private readonly events: EventBus,
  ) {}

  async start(): Promise<void> {}
  async stop(): Promise<void> {
    for (const instance of this.instances.values()) { await this.close(instance.instanceId, 'update').catch(() => {}) }
  }

  register(manifest: AppManifest, source: RegisteredApp['source'] = 'flavor'): void {
    if (this.registry.has(manifest.id)) { throw new Error(`[app-runtime] App already registered: ${manifest.id}`) }
    this.registry.set(manifest.id, { manifest, source })
  }

  list(): RegisteredApp[] {
    return [...this.registry.values()]
  }

  find(instanceId: string): { instance: AppInstance, registered: RegisteredApp } | undefined {
    const instance = this.instances.get(instanceId)
    if (!instance) { return undefined }
    const registered = this.registry.get(instance.appId)
    if (!registered) { return undefined }
    return { instance, registered }
  }

  async open(appId: string): Promise<AppInstance> {
    const registered = this.registry.get(appId)
    if (!registered) { throw new AppOpenError('APP_NOT_FOUND', `App not registered: ${appId}`) }
    if (!await this.admit(registered.manifest)) { throw new AppOpenError('APP_NOT_ALLOWED', `App not allowed: ${appId}`) }

    // 同 App 复用活跃实例
    const activeId = this.activeByApp.get(appId)
    if (activeId) {
      const existing = this.instances.get(activeId)
      if (existing && existing.state !== 'closed') { return existing }
    }

    const instance: AppInstance = {
      instanceId: randomUUID(),
      appId,
      state: 'opening',
      createdAt: Date.now(),
      handle: {},
    }
    this.instances.set(instance.instanceId, instance)
    this.activeByApp.set(appId, instance.instanceId)
    this.events.emit('app.opening', { appId, instanceId: instance.instanceId })

    const opener = this.openers.find(o => o.supports(registered.manifest.entry))
    if (!opener) { throw new AppOpenError('NO_OPENER', `No opener supports entry kind of: ${appId}`) }
    await opener.open(registered.manifest, instance)
    instance.state = 'opened'
    this.events.emit('app.opened', { appId, instanceId: instance.instanceId })
    return instance
  }

  async close(instanceId: string, reason: 'user' | 'crash' | 'update' = 'user'): Promise<void> {
    const instance = this.instances.get(instanceId)
    if (!instance || instance.state === 'closed') { return }
    instance.state = 'closing'
    const registered = this.registry.get(instance.appId)
    const opener = registered && this.openers.find(o => o.supports(registered.manifest.entry))
    if (opener) { await opener.close(instance) }
    instance.state = 'closed'
    if (this.activeByApp.get(instance.appId) === instanceId) { this.activeByApp.delete(instance.appId) }
    this.events.emit('app.closed', { appId: instance.appId, instanceId, reason })
  }
}
