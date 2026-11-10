/**
 * 三维注册表：能力 × 实现 × 平台。三张表求交，产出「这件事在这台机器上能不能做、
 * 由谁做、做不到时因为什么」，供 UI 灰置与诊断台展示。
 */
import type { ChannelRegistry } from './channel'
import type { DeviceStatus, UnavailableReason } from './device-state'
import { readyStatus, unavailableStatus } from './device-state'

export interface CapabilityDescriptor {
  readonly id: string
  readonly label: string
  /** 可选的方法清单，供诊断台列举；方法表本身由各域 methods.ts 声明 */
  readonly methodNames?: readonly string[]
}

export interface PlatformProfile {
  readonly id: string
  readonly label: string
  /** 该平台开放的能力 id 清单 */
  readonly capabilityIds: readonly string[]
  /** 驱动部署方式：随包 / 系统自带 / 现场部署 */
  readonly driverDeployment: 'bundled' | 'system' | 'manual'
  readonly nativeSupported: boolean
  readonly winspoolSupported: boolean
  readonly notes?: string
}

export interface SupportResolution {
  readonly capabilityId: string
  readonly platformId: string
  readonly supported: boolean
  readonly channelId?: string
  readonly reason?: UnavailableReason
  readonly detail?: string
}

export interface DeviceRegistry {
  registerCapability: (descriptor: CapabilityDescriptor) => void
  registerPlatform: (profile: PlatformProfile) => void
  capabilities: () => readonly CapabilityDescriptor[]
  platforms: () => readonly PlatformProfile[]
  resolve: (capabilityId: string, platformId: string, simulated: boolean) => SupportResolution
  resolveAll: (platformId: string, simulated: boolean) => readonly SupportResolution[]
  status: (platformId: string, simulated: boolean) => readonly DeviceStatus[]
}

export function createDeviceRegistry(channels: ChannelRegistry): DeviceRegistry {
  const capabilities = new Map<string, CapabilityDescriptor>()
  const platforms = new Map<string, PlatformProfile>()

  function unsupportedReason(profile: PlatformProfile | undefined): UnavailableReason {
    if (!profile) { return 'platform-unsupported' }
    if (profile.driverDeployment === 'manual') { return 'driver-missing' }
    return 'vendor-sdk-unavailable'
  }

  function resolveOne(capabilityId: string, platformId: string, simulated: boolean): SupportResolution {
    const profile = platforms.get(platformId)
    if (!profile || !profile.capabilityIds.includes(capabilityId)) {
      return {
        capabilityId,
        platformId,
        supported: false,
        reason: 'platform-unsupported',
        detail: profile
          ? `该平台未开放能力：${capabilityId}${profile.notes ? `（${profile.notes}）` : ''}`
          : `未知平台：${platformId}`,
      }
    }
    const channel = channels.resolve(capabilityId, platformId, simulated)
    if (!channel) {
      return {
        capabilityId,
        platformId,
        supported: false,
        reason: unsupportedReason(profile),
        detail: `无可用实现：${capabilityId}/${platformId}`,
      }
    }
    return { capabilityId, platformId, supported: true, channelId: channel.descriptor.id }
  }

  const registry: DeviceRegistry = {
    registerCapability(descriptor) { capabilities.set(descriptor.id, descriptor) },
    registerPlatform(profile) { platforms.set(profile.id, profile) },
    capabilities() { return [...capabilities.values()] },
    platforms() { return [...platforms.values()] },
    resolve: resolveOne,
    resolveAll(platformId, simulated) {
      return [...capabilities.values()].map(c => resolveOne(c.id, platformId, simulated))
    },
    status(platformId, simulated) {
      return [...capabilities.values()].map((c) => {
        const r = resolveOne(c.id, platformId, simulated)
        return r.supported
          ? readyStatus(c.id, c.id, r.channelId ?? '', platformId)
          : unavailableStatus(c.id, c.id, r.reason ?? 'unknown', r.detail)
      })
    },
  }
  return registry
}
