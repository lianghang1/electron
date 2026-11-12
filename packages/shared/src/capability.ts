/**
 * 平台能力矩阵：多端差异收敛为数据，不是代码分支。
 * detectPlatform() 返回一次，处处消费；UI 据此灰置不可用功能。
 */
export const platforms = ['win32', 'darwin', 'linux', 'linux-cn', 'linux-arm64', 'loongarch64'] as const
export type Platform = (typeof platforms)[number]

/**
 * 已登记设备能力的唯一身份源。新增能力域 = 在此加一项；
 * 配置档案、装配表、诊断描述符、通道声明等登记点用
 * `Record<DeviceCapabilityId, ...>` 约束，漏登记一处即编译不通过。
 */
export const DEVICE_CAPABILITIES = [
  { id: 'print', label: '打印' },
  { id: 'capture', label: '高拍仪拍摄' },
  { id: 'idcard', label: '身份证阅读' },
  { id: 'iccard', label: 'IC 卡读写' },
  { id: 'scanner', label: '扫码枪' },
  { id: 'signature', label: '签名板' },
] as const satisfies readonly { readonly id: string, readonly label: string }[]

export type DeviceCapabilityId = (typeof DEVICE_CAPABILITIES)[number]['id']

/** 全部能力 id，供平台档案与各登记表按同一顺序派生。 */
export const DEVICE_CAPABILITY_IDS: readonly DeviceCapabilityId[] = DEVICE_CAPABILITIES.map(c => c.id)

/** 驱动部署方式：bundled = 随包分发；system = 系统自带；manual = 需现场部署 */
export const driverDeployments = ['bundled', 'system', 'manual'] as const

export interface PlatformCapability {
  platform: Platform
  /** 此平台开放的能力 id 清单（如 ['print']）；不在清单内的能力 UI 直接灰置 */
  availableDomains: readonly string[]
  driverDeployment: (typeof driverDeployments)[number]
  /** 是否有原生库对接面（Windows DLL / mac dylib / linux so） */
  nativeSupported: boolean
  /** 是否支持 winspool 打印机能力探测（纸型/硬件默认值，仅 Windows） */
  winspoolSupported: boolean
  /** 平台级备注（说明未开放能力的原因，供诊断台展示） */
  notes?: string
}

/**
 * 各平台能力表（唯一事实源：新增信创平台 = 加一行，零业务代码改动）。
 * 底座三维求交、UI 灰置、诊断台原因码都从这一份数据推导，不另立事实源。
 */
export const PLATFORM_CAPABILITIES: Record<Platform, PlatformCapability> = {
  'win32': { platform: 'win32', availableDomains: DEVICE_CAPABILITY_IDS, driverDeployment: 'bundled', nativeSupported: true, winspoolSupported: true },
  'darwin': { platform: 'darwin', availableDomains: ['print'], driverDeployment: 'system', nativeSupported: false, winspoolSupported: false, notes: '厂商未提供 macOS 原生 SDK，非打印能力不可用' },
  'linux': { platform: 'linux', availableDomains: ['print'], driverDeployment: 'system', nativeSupported: false, winspoolSupported: false, notes: '厂商未提供 Linux 原生 SDK，非打印能力不可用' },
  'linux-cn': { platform: 'linux-cn', availableDomains: ['print'], driverDeployment: 'manual', nativeSupported: false, winspoolSupported: false, notes: '统信 UOS / 银河麒麟：厂商驱动需现场部署' },
  'linux-arm64': { platform: 'linux-arm64', availableDomains: ['print'], driverDeployment: 'manual', nativeSupported: false, winspoolSupported: false, notes: 'ARM 架构信创平台：厂商驱动需现场部署' },
  'loongarch64': { platform: 'loongarch64', availableDomains: [], driverDeployment: 'manual', nativeSupported: false, winspoolSupported: false, notes: '龙芯架构：无官方 Electron 产物，仅支持 remote 形态接入' },
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
