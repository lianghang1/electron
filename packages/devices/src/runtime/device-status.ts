import type { DeviceStatus } from './device-state'
import type { CapabilityDescriptor, SupportResolution } from './registry'
import { readyStatus, unavailableStatus } from './device-state'

/**
 * 依据平台开放清单与三维求交结论，产出六域设备状态。
 * 诊断台灰置、原因码展示读这一份结果，不在渲染层另写平台判断。
 */
export function buildDeviceStatuses(
  capabilities: readonly CapabilityDescriptor[],
  resolutions: readonly SupportResolution[],
  availableDomains: readonly string[],
  platformId: string,
): DeviceStatus[] {
  return capabilities.map((capability) => {
    const resolution = resolutions.find(r => r.capabilityId === capability.id)
    if (availableDomains.includes(capability.id)) {
      return readyStatus(capability.id, capability.id, resolution?.channelId ?? `${capability.id}:assembled`, platformId)
    }
    return unavailableStatus(
      capability.id,
      capability.id,
      resolution?.reason ?? 'platform-unsupported',
      resolution?.detail,
    )
  })
}
