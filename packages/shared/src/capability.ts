/**
 * 平台能力矩阵：多端差异收敛为数据，不是代码分支。
 * detectPlatform() 返回一次，处处消费；UI 据此灰置不可用功能。
 */
export const platforms = ['win32', 'darwin', 'linux', 'linux-cn', 'linux-arm64', 'loongarch64'] as const
export type Platform = (typeof platforms)[number]

/** 驱动部署方式：bundled = 随包分发；system = 系统自带；manual = 需现场部署 */
export const driverDeployments = ['bundled', 'system', 'manual'] as const

export interface PlatformCapability {
  platform: Platform
  /** 此平台可用的硬件域（如 ['print']）；不在清单内的域 UI 直接灰置 */
  availableDomains: readonly string[]
  driverDeployment: (typeof driverDeployments)[number]
  /** 平台级备注（如 loongarch 仅支持纯 web 接入形态） */
  notes?: string
}

/** 各平台能力表（唯一事实源：新增信创平台 = 加一行，零业务代码改动） */
export const PLATFORM_CAPABILITIES: Record<Platform, PlatformCapability> = {
  'win32': { platform: 'win32', availableDomains: ['idcard', 'print', 'iccard', 'scanner', 'capture', 'signature'], driverDeployment: 'bundled' },
  'darwin': { platform: 'darwin', availableDomains: ['print'], driverDeployment: 'system' },
  'linux': { platform: 'linux', availableDomains: ['print'], driverDeployment: 'system' },
  'linux-cn': { platform: 'linux-cn', availableDomains: ['print'], driverDeployment: 'manual' },
  'linux-arm64': { platform: 'linux-arm64', availableDomains: ['print'], driverDeployment: 'manual' },
  'loongarch64': { platform: 'loongarch64', availableDomains: [], driverDeployment: 'manual', notes: '无官方 electron 产物时仅支持 remote 形态接入' },
}

/**
 * 设备层平台标识（windows/mac/linux/linux-cn）→ 能力矩阵键。
 * 架构细分（arm64/loong64）优先级高于发行版细分，均为数据表，无 if/switch。
 * 组合根探测一次后调用，结果处处消费（UI 灰置 / 域降级 / 驱动装配）。
 */
const DEVICE_PLATFORM_KEYS: Record<string, Platform> = {
  'windows': 'win32',
  'mac': 'darwin',
  'linux': 'linux',
  'linux-cn': 'linux-cn',
}

/** 复合键：仅 linux 系的架构细分命中，win32/darwin 的 arm64 不会误入信创条目 */
const COMPOSITE_KEYS: Record<string, Platform> = {
  'linux:arm64': 'linux-arm64',
  'linux-cn:arm64': 'linux-arm64',
  'linux:loong64': 'loongarch64',
  'linux-cn:loong64': 'loongarch64',
}

/** 未知 arch/平台一律回落到标准 linux，能力表始终有条目；全程查表，零分支 */
export function resolveCapability(devicePlatformId: string, arch: string): PlatformCapability {
  const key = COMPOSITE_KEYS[`${devicePlatformId}:${arch}`]
    ?? DEVICE_PLATFORM_KEYS[devicePlatformId]
    ?? 'linux'
  return PLATFORM_CAPABILITIES[key]
}
