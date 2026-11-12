/**
 * 平台档案：把唯一事实源 PLATFORM_CAPABILITIES 接进三维注册表。
 * 能力 × 实现 × 平台 的求交结果、UI 灰置、诊断台原因码都从这里出发，
 * 不在域代码里另写平台判断。新增平台只需在能力表加一行；新增能力在身份表登记即自动接入。
 */
import type { CapabilityDescriptor, DeviceRegistry, PlatformProfile } from './registry'
import { DEVICE_CAPABILITIES, PLATFORM_CAPABILITIES } from '@shell/shared'

const PLATFORM_LABELS: Record<string, string> = {
  'win32': 'Windows',
  'darwin': 'macOS',
  'linux': 'Linux',
  'linux-cn': '国产 Linux（UOS / 麒麟）',
  'linux-arm64': 'ARM Linux（信创）',
  'loongarch64': '龙芯 Linux',
}

/** 能力身份来自唯一事实源；方法表由各域 methods.ts 声明，注册表只登记身份。 */
export const CAPABILITY_DESCRIPTORS: readonly CapabilityDescriptor[] = DEVICE_CAPABILITIES.map(
  ({ id, label }) => ({ id, label }),
)

/** 能力表 → 平台档案，含原因说明文案。 */
export function buildPlatformProfiles(): PlatformProfile[] {
  return Object.values(PLATFORM_CAPABILITIES).map(cap => ({
    id: cap.platform,
    label: PLATFORM_LABELS[cap.platform] ?? cap.platform,
    capabilityIds: cap.availableDomains,
    driverDeployment: cap.driverDeployment,
    nativeSupported: cap.nativeSupported,
    winspoolSupported: cap.winspoolSupported,
    notes: cap.notes,
  }))
}

/** 把全部已登记能力 + 全部平台档案登记进注册表。 */
export function registerStandardCatalog(registry: DeviceRegistry): void {
  for (const descriptor of CAPABILITY_DESCRIPTORS) { registry.registerCapability(descriptor) }
  for (const profile of buildPlatformProfiles()) { registry.registerPlatform(profile) }
}
