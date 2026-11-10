/**
 * 设备通道契约：一家厂商 + 一种接入方式 = 一个实现。
 * 域只面对本契约，DLL/dylib/so 加载、句柄生命周期、设备枚举、重试、真实与仿真
 * 切换都收敛到这一层，能力域不再各自实现。
 */
import type { DeviceStatus } from './device-state'
import type { DeviceErrorCode } from './errors'
import { deviceError, toDeviceError } from './errors'

export type ChannelTransport = 'dll' | 'websocket' | 'wia' | 'ws-scan' | 'system-print' | 'ipp' | 'raw' | 'simulated'

export interface ChannelDescriptor {
  /** 实现标识，如 camsdk / decard / ipp / sumatra / simulated */
  readonly id: string
  readonly capabilityId: string
  readonly vendor: string
  readonly transport: ChannelTransport
  /** 该实现可用的平台；空数组表示全平台 */
  readonly platformIds: readonly string[]
  /** 是否为仿真实现（无硬件演示与契约测试用） */
  readonly simulated: boolean
}

export interface ChannelHandle {
  readonly id: string
  close: () => Promise<void> | void
}

export interface DeviceChannel {
  readonly descriptor: ChannelDescriptor
  /** 探测设备是否就位，返回状态；不抛异常 */
  probe: () => Promise<DeviceStatus> | DeviceStatus
  /** 枚举该实现可见的设备 */
  listDevices: () => Promise<readonly string[]> | readonly string[]
  /** 打开句柄；失败抛 DeviceError */
  open: () => Promise<ChannelHandle> | ChannelHandle
  /** 执行一次设备动作；失败抛 DeviceError */
  invoke: (handle: ChannelHandle, method: string, input: unknown) => Promise<unknown> | unknown
}

export interface ChannelRegistry {
  register: (channel: DeviceChannel) => void
  get: (id: string) => DeviceChannel | undefined
  forCapability: (capabilityId: string) => readonly DeviceChannel[]
  resolve: (capabilityId: string, platformId: string, preferSimulated: boolean) => DeviceChannel | undefined
  list: () => readonly DeviceChannel[]
  count: () => number
}

export function createChannelRegistry(): ChannelRegistry {
  const channels = new Map<string, DeviceChannel>()
  return {
    register(channel) {
      if (channels.has(channel.descriptor.id)) {
        throw deviceError('CHANNEL_UNAVAILABLE', `通道重复注册：${channel.descriptor.id}`)
      }
      channels.set(channel.descriptor.id, channel)
    },
    get(id) { return channels.get(id) },
    forCapability(capabilityId) {
      return [...channels.values()].filter(c => c.descriptor.capabilityId === capabilityId)
    },
    resolve(capabilityId, platformId, preferSimulated) {
      const candidates = [...channels.values()].filter((c) => {
        const d = c.descriptor
        if (d.capabilityId !== capabilityId) { return false }
        if (d.platformIds.length && !d.platformIds.includes(platformId)) { return false }
        return d.simulated === preferSimulated
      })
      return candidates[0]
    },
    list() { return [...channels.values()] },
    count() { return channels.size },
  }
}

export interface ChannelRuntimeOptions {
  readonly retryCount: number
  readonly retryDelayMs?: number
  readonly sleep?: (ms: number) => Promise<void>
}

/** 统一的句柄打开与调用重试；异常一律归一为 DeviceError。 */
export async function withChannel(
  channel: DeviceChannel,
  method: string,
  input: unknown,
  options: ChannelRuntimeOptions = { retryCount: 0 },
): Promise<unknown> {
  let lastError: unknown
  for (let attempt = 0; attempt <= options.retryCount; attempt++) {
    let handle: ChannelHandle | undefined
    try {
      handle = await channel.open()
      return await channel.invoke(handle, method, input)
    }
    catch (err) {
      lastError = err
      if (attempt < options.retryCount && options.sleep && options.retryDelayMs) {
        await options.sleep(options.retryDelayMs)
      }
    }
    finally {
      if (handle) { await handle.close() }
    }
  }
  throw toDeviceError(lastError, channelCallError(method))
}

function channelCallError(method: string): DeviceErrorCode {
  return method.startsWith('print') ? 'CHANNEL_UNAVAILABLE' : 'DEVICE_UNAVAILABLE'
}
