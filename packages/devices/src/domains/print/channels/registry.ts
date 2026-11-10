/**
 * print 域通道声明：能力 × 实现 × 平台的事实源。
 * 每条记录 = 一家厂商的一种接入手法；platformIds 决定该实现在哪些端可用。
 * 具体实现按 runtime/channel.ts 的 DeviceChannel 契约绑定。
 */
import type { ChannelDescriptor } from '../../../runtime/channel'

const ALL_PLATFORMS = ['win32', 'darwin', 'linux', 'linux-cn', 'linux-arm64', 'loongarch64'] as const

export const PRINT_CHANNELS: readonly ChannelDescriptor[] = [
  {
    id: 'chromium-hidden-window',
    capabilityId: 'print',
    vendor: 'chromium',
    transport: 'system-print',
    platformIds: ALL_PLATFORMS,
    simulated: false,
  },
  {
    id: 'sumatra-pdf',
    capabilityId: 'print',
    vendor: 'sumatra',
    transport: 'system-print',
    platformIds: ['win32'],
    simulated: false,
  },
  {
    id: 'cups-lp',
    capabilityId: 'print',
    vendor: 'cups',
    transport: 'system-print',
    platformIds: ['darwin', 'linux', 'linux-cn', 'linux-arm64', 'loongarch64'],
    simulated: false,
  },
  {
    id: 'ipp',
    capabilityId: 'print',
    vendor: 'ipp',
    transport: 'ipp',
    platformIds: ALL_PLATFORMS,
    simulated: false,
  },
  {
    id: 'raw-escpos',
    capabilityId: 'print',
    vendor: 'esc-pos',
    transport: 'raw',
    platformIds: ['win32'],
    simulated: false,
  },
]

/** 按能力 + 平台筛出可用实现：诊断台与平台档案共用同一份声明。 */
export function channelsForPlatform(capabilityId: string, platformId: string): readonly ChannelDescriptor[] {
  return PRINT_CHANNELS.filter(d => d.capabilityId === capabilityId && d.platformIds.includes(platformId))
}
