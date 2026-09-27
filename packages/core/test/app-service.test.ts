import type { DesktopAppManifest, DesktopConfig } from '@desktop/shared'
import { DesktopError } from '@desktop/shared'
import { describe, expect, it, vi } from 'vitest'
import { AppRegistry } from '../src/app/app-registry'
import { AppService } from '../src/app/app-service'
import { EventBus } from '../src/event/event-bus'

function manifest(id: string, type: DesktopAppManifest['type'] = 'internal'): DesktopAppManifest {
  return {
    id,
    name: id.toUpperCase(),
    version: '1.0.0',
    type,
    entry: { type: 'web', url: `https://example.com/${id}` },
    permissions: [],
  }
}

function createService(allowThirdParty = false): { service: AppService, events: EventBus } {
  const events = new EventBus()
  const registry = new AppRegistry()
  registry.register(manifest('crm'))
  registry.register(manifest('ext', 'third-party'))
  const config = { apps: { allowThirdParty } } as DesktopConfig
  return { service: new AppService(registry, config, events), events }
}

describe('appService.open', () => {
  it('未注册的 App 抛 APP_NOT_FOUND', async () => {
    const { service } = createService()
    await expect(service.open('nope')).rejects.toThrowError(DesktopError)
  })

  it('third-party App 被 allowThirdParty=false 拦截', async () => {
    const { service } = createService(false)
    await expect(service.open('ext')).rejects.toThrowError(/not allowed/)
  })

  it('allowThirdParty=true 时放行', async () => {
    const { service } = createService(true)
    await expect(service.open('ext')).resolves.toMatchObject({ appId: 'ext', state: 'opening' })
  })

  it('同一 App 重复 open 复用活跃实例（第一阶段一 App 一 Instance）', async () => {
    const { service } = createService()
    const first = await service.open('crm')
    const second = await service.open('crm')
    expect(second.instanceId).toBe(first.instanceId)
  })
})

describe('appService 生命周期', () => {
  it('markOpened：opening → opened 并广播 app:opened', async () => {
    const { service, events } = createService()
    const onOpened = vi.fn()
    events.on('app:opened', onOpened)
    const instance = await service.open('crm')
    service.markOpened(instance.instanceId)
    expect(service.get(instance.instanceId)?.state).toBe('opened')
    expect(onOpened).toHaveBeenCalledOnce()
  })

  it('close：置 closed、清活跃映射并广播 app:closed', async () => {
    const { service, events } = createService()
    const onClosed = vi.fn()
    events.on('app:closed', onClosed)
    const instance = await service.open('crm')
    await service.close(instance.instanceId)
    expect(service.get(instance.instanceId)?.state).toBe('closed')
    expect(onClosed).toHaveBeenCalledOnce()
    // 关闭后重新 open 获得新实例（复用逻辑只对活跃实例生效）
    const reopened = await service.open('crm')
    expect(reopened.instanceId).not.toBe(instance.instanceId)
  })

  it('重复 close 幂等（事件只广播一次）', async () => {
    const { service, events } = createService()
    const onClosed = vi.fn()
    events.on('app:closed', onClosed)
    const instance = await service.open('crm')
    await service.close(instance.instanceId)
    await service.close(instance.instanceId)
    expect(onClosed).toHaveBeenCalledOnce()
  })
})
