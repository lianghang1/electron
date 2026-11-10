/**
 * signature 域通道声明：能力 × 实现 × 平台的事实源。
 * 每条记录 = 一家厂商的一种接入手法；platformIds 决定该实现在哪些端可用。
 * 具体实现按 runtime/channel.ts 的 DeviceChannel 契约绑定。
 */
import type { ChannelDescriptor } from '../../../runtime/channel'

const ALL_PLATFORMS = ['win32', 'darwin', 'linux', 'linux-cn', 'linux-arm64', 'loongarch64'] as const

export const SIGNATURE_CHANNELS: readonly ChannelDescriptor[] = [
  {
    id: 'hanvon-dll',
    capabilityId: 'signature',
    vendor: 'hanvon',
    transport: 'dll',
    platformIds: ['win32'],
    simulated: false,
  },
  {
    id: 'camsdk-pad',
    capabilityId: 'signature',
    vendor: 'camsdk',
    transport: 'websocket',
    platformIds: ['win32'],
    simulated: false,
  },
]

/** 按能力 + 平台筛出可用实现：诊断台与平台档案共用同一份声明。 */
export function channelsForPlatform(capabilityId: string, platformId: string): readonly ChannelDescriptor[] {
  return SIGNATURE_CHANNELS.filter(d => d.capabilityId === capabilityId && d.platformIds.includes(platformId))
}
