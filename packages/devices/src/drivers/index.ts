import type { PlatformCapability } from '@shell/shared'
import type { DriverResolver } from './contract'
import { PLATFORM_CAPABILITIES, resolveCapability } from '@shell/shared'
import { BundledDriverResolver } from './bundled'
import { ManualDriverResolver } from './manual'
import { SystemDriverResolver } from './system'

export { BundledDriverResolver } from './bundled'
export type { DriverDeployment, DriverResolver } from './contract'
export { ManualDriverResolver } from './manual'
export { SystemDriverResolver } from './system'

/**
 * 驱动资产根：bundled 随包（resources/），manual 现场（platformDataRoot()/devices/）。
 * 由组合根按唯一路径出口注入，drivers 层不自行寻址。
 */
export interface DriverRoots {
  bundled: string
  manual: string
}

/** 部署方式 → 策略构造器：平台差异收敛为数据表，零 switch */
const RESOLVERS: Record<PlatformCapability['driverDeployment'], (roots: DriverRoots) => DriverResolver> = {
  bundled: roots => new BundledDriverResolver(roots.bundled),
  manual: roots => new ManualDriverResolver(roots.manual),
  system: () => new SystemDriverResolver(),
}

/** 组合根唯一创建点：查能力表 → 查策略表 → 注入域系统 */
export function createDriverResolver(capability: PlatformCapability, roots: DriverRoots): DriverResolver {
  return RESOLVERS[capability.driverDeployment](roots)
}

/** 从设备层平台标识 + CPU 架构解析能力（组合根探测一次，结果处处消费） */
export function resolvePlatformCapability(devicePlatformId: string, arch: string): PlatformCapability {
  return resolveCapability(devicePlatformId, arch)
}

/** 能力表再导出，便于组合根/UI 只从 @shell/devices 一处取 */
export { PLATFORM_CAPABILITIES }
export type { PlatformCapability } from '@shell/shared'
