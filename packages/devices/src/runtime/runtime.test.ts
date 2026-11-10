import type { ChannelHandle, DeviceChannel } from './channel'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  createChannelRegistry,
  createConfigStore,
  createDeviceRegistry,
  createDeviceTelemetry,
  createInvocationPipeline,
  createLeaseRegistry,
  DeviceError,
  isDeviceError,
  isOperational,
  toDeviceError,
  transition,
  withChannel,
} from '.'

function simulatedChannel(capabilityId: string, id: string, platformIds: string[] = []): DeviceChannel {
  return {
    descriptor: { id, capabilityId, vendor: 'sim', transport: 'simulated', platformIds, simulated: true },
    probe: () => ({ deviceId: `${id}-0`, capabilityId, channelId: id, state: 'ready' }),
    listDevices: () => [`${id}-0`],
    open: () => ({ id, close: () => {} }),
    invoke: (_handle: ChannelHandle, method: string) => ({ method }),
  }
}

describe('errors —— 统一错误形状', () => {
  it('deviceError 带 code 且可 JSON 化', () => {
    const e = new DeviceError('BUSY', '占用中', { by: 'a' })
    expect(isDeviceError(e)).toBe(true)
    expect(e.toJSON()).toEqual({ code: 'BUSY', message: '占用中', detail: { by: 'a' } })
  })

  it('未知异常归一为 UNKNOWN 并保留 message', () => {
    expect(toDeviceError(new Error('boom')).code).toBe('UNKNOWN')
    expect(toDeviceError('oops').message).toBe('oops')
  })

  it('远端搬运的 code 在码表内时按原码还原', () => {
    const remote = Object.assign(new Error('远端失败'), { code: 'DRIVER_MISSING', detail: { dll: 'x' } })
    const normalized = toDeviceError(remote)
    expect(normalized.code).toBe('DRIVER_MISSING')
    expect(normalized.detail).toEqual({ dll: 'x' })
  })
})

describe('device-state —— 状态迁移', () => {
  it('unavailable 只能到 ready 或保持', () => {
    expect(transition({ deviceId: 'd', capabilityId: 'c', state: 'unavailable' }, 'ready').state).toBe('ready')
    expect(() => transition({ deviceId: 'd', capabilityId: 'c', state: 'unavailable' }, 'busy')).toThrow()
  })

  it('ready/degraded 可判定为可服务', () => {
    expect(isOperational({ deviceId: 'd', capabilityId: 'c', state: 'ready' })).toBe(true)
    expect(isOperational({ deviceId: 'd', capabilityId: 'c', state: 'degraded' })).toBe(true)
    expect(isOperational({ deviceId: 'd', capabilityId: 'c', state: 'unavailable' })).toBe(false)
  })
})

describe('session —— 租约仲裁', () => {
  let clock = 0
  function registry() {
    clock = 0
    return createLeaseRegistry({ ttlMs: 100, now: () => clock })
  }
  const owner = { appId: 'app', instanceId: 'i1' }
  const other = { appId: 'other', instanceId: 'i2' }

  it('同一设备第二个应用被 BUSY 拒绝', () => {
    const r = registry()
    r.acquire(owner, 'capture', 'cam-1')
    expect(() => r.acquire(other, 'capture', 'cam-1')).toThrow(/占用/)
  })

  it('不同设备可并行持有', () => {
    const r = registry()
    r.acquire(owner, 'capture', 'cam-1')
    expect(() => r.acquire(other, 'capture', 'cam-2')).not.toThrow()
  })

  it('tTL 到期后 sweep 回收，可再次获取', () => {
    const r = registry()
    r.acquire(owner, 'capture', 'cam-1')
    clock = 101
    expect(r.sweep()).toBe(1)
    expect(r.holder('capture', 'cam-1')).toBeUndefined()
    expect(() => r.acquire(other, 'capture', 'cam-1')).not.toThrow()
  })

  it('非持有者不能续租', () => {
    const r = registry()
    const lease = r.acquire(owner, 'capture', 'cam-1')
    expect(() => r.renew(lease.leaseId, other)).toThrow(/持有者不匹配/)
  })
})

describe('config-store —— 出厂值与现场覆盖', () => {
  interface Profile { displayName: string, url: string, baud: number }
  let written: unknown
  const store = createConfigStore<Profile>({
    capabilityId: 'idcard',
    defaults: { r1: { displayName: '读卡器', url: 'ws://a', baud: 9600 } },
    overridableKeys: ['url', 'baud'],
    read: () => undefined,
    write: (doc) => { written = doc },
  })

  it('只放行白名单字段，出厂值不被污染', () => {
    const config = store.setOverrides('r1', { url: 'ws://b', displayName: '不该生效' } as Partial<Profile>)
    expect(config.url).toBe('ws://b')
    expect(config.displayName).toBe('读卡器')
    expect(store.get('r1').url).toBe('ws://b')
  })

  it('未知档案被拒且写盘发生', () => {
    expect(() => store.get('nope')).toThrow(/未知设备档案/)
    expect(written).toBeDefined()
  })

  it('恢复出厂清掉覆盖', () => {
    store.resetToFactory()
    expect(store.get('r1').url).toBe('ws://a')
    expect(store.list()[0].overridden).toEqual([])
  })
})

describe('channel + registry —— 三维求交', () => {
  function fixture() {
    const channels = createChannelRegistry()
    channels.register(simulatedChannel('print', 'sim-print'))
    channels.register(simulatedChannel('idcard', 'sim-idcard', ['win32']))
    const registry = createDeviceRegistry(channels)
    registry.registerCapability({ id: 'print', label: '打印', methodNames: [] })
    registry.registerCapability({ id: 'idcard', label: '身份证', methodNames: [] })
    registry.registerPlatform({ id: 'win32', label: 'Windows', capabilityIds: ['print', 'idcard'], driverDeployment: 'bundled', nativeSupported: true, winspoolSupported: true })
    registry.registerPlatform({ id: 'linux-cn', label: '国产 Linux', capabilityIds: ['print'], driverDeployment: 'manual', nativeSupported: false, winspoolSupported: false })
    return { channels, registry }
  }

  it('平台未开放 → platform-unsupported 且带原因', () => {
    const r = fixture().registry.resolve('idcard', 'linux-cn', true)
    expect(r.supported).toBe(false)
    expect(r.reason).toBe('platform-unsupported')
    expect(r.detail).toContain('未开放')
  })

  it('平台开放但无对应实现 → driver-missing', () => {
    const r = fixture().registry.resolve('print', 'linux-cn', false)
    expect(r.supported).toBe(false)
    expect(r.reason).toBe('driver-missing')
  })

  it('能力 × 实现 × 平台齐备 → 命中通道', () => {
    const r = fixture().registry.resolve('print', 'win32', true)
    expect(r.supported).toBe(true)
    expect(r.channelId).toBe('sim-print')
  })

  it('resolveAll 覆盖全部能力，status 一一对应', () => {
    const { registry } = fixture()
    expect(registry.resolveAll('win32', true)).toHaveLength(2)
    expect(registry.status('win32', true)).toHaveLength(2)
  })

  it('重复注册同一实现被拒', () => {
    const { channels } = fixture()
    expect(() => channels.register(simulatedChannel('print', 'sim-print'))).toThrow(/重复注册/)
  })
})

describe('withChannel —— 句柄关闭与重试', () => {
  it('成功路径打开并关闭句柄', async () => {
    let closed = false
    const channel: DeviceChannel = {
      ...simulatedChannel('print', 'x'),
      open: () => ({ id: 'h', close: () => { closed = true } }),
    }
    await withChannel(channel, 'print.submitPrintJob', {})
    expect(closed).toBe(true)
  })

  it('失败按次数重试后归一为 DeviceError', async () => {
    let attempts = 0
    const channel: DeviceChannel = {
      ...simulatedChannel('print', 'y'),
      open: () => { attempts++; throw new Error('打开失败') },
    }
    await expect(withChannel(channel, 'print.submitPrintJob', {}, { retryCount: 2 })).rejects.toMatchObject({ code: 'CHANNEL_UNAVAILABLE' })
    expect(attempts).toBe(3)
  })
})

describe('invocation —— 调用管线', () => {
  function pipeline() {
    const telemetry = createDeviceTelemetry()
    const leases = createLeaseRegistry({ ttlMs: 1000, now: () => 0 })
    const p = createInvocationPipeline({ leases, telemetry, now: () => 0 })
    return { p, telemetry, leases }
  }
  const ctx = { capabilityId: 'print', methodName: 'print.submitPrintJob', appId: 'app', instanceId: 'i1' }
  const step = { input: z.object({ code: z.string() }), handle: (i: { code: string }) => i.code }

  it('合法入参返回 handler 结果并记一条成功打点', async () => {
    const { p, telemetry } = pipeline()
    expect(await p.run(ctx, { code: 'ok' }, step)).toBe('ok')
    expect(telemetry.snapshot()).toMatchObject({ calls: 1, failures: 0 })
  })

  it('非法入参归一为 INVALID_INPUT 并记失败打点', async () => {
    const { p, telemetry } = pipeline()
    await expect(p.run(ctx, { code: 3 }, step)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(telemetry.snapshot().failures).toBe(1)
  })

  it('权限未放行不进入 handler', async () => {
    const telemetry = createDeviceTelemetry()
    const p = createInvocationPipeline({
      leases: createLeaseRegistry({ ttlMs: 1000 }),
      telemetry,
      authorize: () => false,
      now: () => 0,
    })
    await expect(p.run(ctx, { code: 'x' }, { ...step, grant: 'device.print' })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
  })

  it('独占设备调用结束后释放租约', async () => {
    const { p, leases } = pipeline()
    await p.run({ ...ctx, deviceId: 'printer-1' }, { code: 'x' }, step)
    expect(leases.holder('print', 'printer-1')).toBeUndefined()
  })
})
