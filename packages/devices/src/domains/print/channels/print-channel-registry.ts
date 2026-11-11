import type { ChannelId } from '@shell/shared'
import type { PrintChannel } from './print-channel'
import { printError } from '../errors'
import { PRINT_CHANNELS } from './registry'

const DECLARED_IDS = new Set(PRINT_CHANNELS.map(d => d.id))

/**
 * 打印通道注册表：实现按 ChannelId 登记，登记时校验其声明存在于能力事实源，
 * 保证六端能力表与运行时实现始终对齐。
 */
export interface PrintChannelRegistry {
  register: (channel: PrintChannel) => void
  get: (id: ChannelId) => PrintChannel | undefined
  require: (id: ChannelId) => PrintChannel
  list: () => readonly PrintChannel[]
  ids: () => readonly ChannelId[]
  count: () => number
}

export function createPrintChannelRegistry(): PrintChannelRegistry {
  const channels = new Map<ChannelId, PrintChannel>()
  return {
    register(channel) {
      if (!DECLARED_IDS.has(channel.descriptorId)) {
        throw printError('CHANNEL_UNAVAILABLE', `通道实现缺少能力声明：${channel.descriptorId}`)
      }
      if (channels.has(channel.id)) {
        throw printError('CHANNEL_UNAVAILABLE', `通道重复注册：${channel.id}`)
      }
      channels.set(channel.id, channel)
    },
    get(id) { return channels.get(id) },
    require(id) {
      const ch = channels.get(id)
      if (!ch) { throw printError('VALIDATION_FAILED', `未知通道: ${id}`) }
      return ch
    },
    list() { return [...channels.values()] },
    ids() { return [...channels.keys()] },
    count() { return channels.size },
  }
}
