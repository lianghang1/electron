import type { CallerContext, Permission } from '@desktop/shared'
import type { Logger } from '../src/logger/logger'
import { PERMISSIONS } from '@desktop/shared'
import { describe, expect, it, vi } from 'vitest'
import { AppRegistry } from '../src/app/app-registry'
import { SHELL_APP_ID } from '../src/constants'
import { EventBus } from '../src/event/event-bus'
import { PermissionService } from '../src/permission/permission-service'

const shell: CallerContext = { appId: SHELL_APP_ID, instanceId: 'shell' }
const crm: CallerContext = { appId: 'crm', instanceId: 'crm-1' }

/** 单测环境无 electron-store：决策仅内存（PermissionService 预留的测试形态） */
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as Logger

function createService(permissions?: Permission[]): { service: PermissionService, events: EventBus } {
  const events = new EventBus()
  const registry = new AppRegistry()
  registry.register({
    id: 'crm',
    name: 'CRM',
    version: '1.0.0',
    type: 'internal',
    entry: { type: 'web', url: 'https://example.com' },
    permissions,
  })
  return { service: new PermissionService(registry, events, logger), events }
}

describe('permissionService.check / assert', () => {
  it('shell 全量放行', () => {
    const { service } = createService([])
    expect(service.check(shell, PERMISSIONS[0])).toBe(true)
  })

  it('manifest 已声明的权限放行，未声明的拒绝', () => {
    const { service } = createService([PERMISSIONS[0]])
    expect(service.check(crm, PERMISSIONS[0])).toBe(true)
    expect(service.check(crm, PERMISSIONS[1])).toBe(false)
  })

  it('未注册 App 一律拒绝', () => {
    const { service } = createService([PERMISSIONS[0]])
    expect(service.check({ appId: 'ghost', instanceId: 'ghost' }, PERMISSIONS[0])).toBe(false)
  })

  it('assert 拒绝时抛 PERMISSION_DENIED 并广播 permission:denied', () => {
    const { service, events } = createService([])
    const onDenied = vi.fn()
    events.on('permission:denied', onDenied)
    expect(() => service.assert(crm, PERMISSIONS[0])).toThrowError(/Permission denied/)
    expect(onDenied).toHaveBeenCalledOnce()
    expect(service.check(shell, PERMISSIONS[0])).toBe(true)
  })
})

describe('permissionService.requestRuntime', () => {
  it('推送授权请求，用户同意后持久化，二次请求直接命中缓存', async () => {
    const { service, events } = createService([])
    const onRequest = vi.fn()
    events.on('permission:request', onRequest)

    const first = service.requestRuntime(crm, PERMISSIONS[0])
    expect(onRequest).toHaveBeenCalledOnce()

    const request = onRequest.mock.calls[0][0]
    service.respond(request.requestId, true)
    await expect(first).resolves.toBe(true)

    // 决策已缓存：不再发起第二次询问
    await expect(service.requestRuntime(crm, PERMISSIONS[0])).resolves.toBe(true)
    expect(onRequest).toHaveBeenCalledOnce()
  })

  it('决策进行中重复触发复用同一次询问（不产生第二张授权卡）', async () => {
    const { service, events } = createService([])
    const onRequest = vi.fn()
    events.on('permission:request', onRequest)

    const a = service.requestRuntime(crm, PERMISSIONS[0])
    const b = service.requestRuntime(crm, PERMISSIONS[0])
    const request = onRequest.mock.calls[0][0]
    service.respond(request.requestId, false)
    await expect(a).resolves.toBe(false)
    await expect(b).resolves.toBe(false)
    expect(onRequest).toHaveBeenCalledOnce()
  })

  it('用户拒绝不记忆：下次请求重新询问（拒绝不永久挡住，对齐重置授权语义）', async () => {
    const { service, events } = createService([])
    const onRequest = vi.fn()
    events.on('permission:request', onRequest)
    const first = service.requestRuntime(crm, PERMISSIONS[0])
    const request = onRequest.mock.calls[0][0]
    service.respond(request.requestId, false)
    await expect(first).resolves.toBe(false)

    // 拒绝只影响本次：第二次请求重新推送询问，再次拒绝仍按本次拒绝
    const second = service.requestRuntime(crm, PERMISSIONS[0])
    expect(onRequest).toHaveBeenCalledTimes(2)
    const retry = onRequest.mock.calls[1][0]
    service.respond(retry.requestId, false)
    await expect(second).resolves.toBe(false)
  })

  it('超时按拒绝处理', async () => {
    vi.useFakeTimers()
    try {
      const { service } = createService([])
      const pending = service.requestRuntime(crm, PERMISSIONS[0])
      await vi.advanceTimersByTimeAsync(30_000)
      await expect(pending).resolves.toBe(false)
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('cancelForApp：App 退出时挂起请求按拒绝处理', async () => {
    const { service } = createService([])
    const pending = service.requestRuntime(crm, PERMISSIONS[0])
    service.cancelForApp(crm.appId)
    await expect(pending).resolves.toBe(false)
  })
})

describe('permissionService.listPermissionStates', () => {
  it('合成视图：声明权限 granted=true，未声明 granted=null', () => {
    const { service } = createService([PERMISSIONS[0]])
    const states = service.listPermissionStates(crm.appId)
    expect(states).toHaveLength(PERMISSIONS.length)
    expect(states.find(s => s.permission === PERMISSIONS[0])).toMatchObject({ declared: true, granted: true })
    expect(states.find(s => s.permission === PERMISSIONS[1])).toMatchObject({ declared: false, granted: null })
  })

  it('shell 视为全量声明', () => {
    const { service } = createService([])
    const states = service.listPermissionStates(SHELL_APP_ID)
    expect(states.every(s => s.declared)).toBe(true)
  })
})
