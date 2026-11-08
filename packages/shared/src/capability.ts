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

/** 各平台能力表（M4 按驱动包实际情况填充） */
export const PLATFORM_CAPABILITIES: Record<Platform, PlatformCapability> = {
  'win32': { platform: 'win32', availableDomains: ['idcard', 'print', 'iccard', 'scanner', 'capture', 'signature'], driverDeployment: 'bundled' },
  'darwin': { platform: 'darwin', availableDomains: ['print'], driverDeployment: 'system' },
  'linux': { platform: 'linux', availableDomains: ['print'], driverDeployment: 'system' },
  'linux-cn': { platform: 'linux-cn', availableDomains: ['print'], driverDeployment: 'manual' },
  'linux-arm64': { platform: 'linux-arm64', availableDomains: ['print'], driverDeployment: 'manual' },
  'loongarch64': { platform: 'loongarch64', availableDomains: [], driverDeployment: 'manual', notes: '无官方 electron 产物时仅支持 remote 形态接入' },
}
