import type { CaptureVendor } from './vendor-contracts'
import { camSdkVendor } from './camsdk'
import { dianyipaiVendor } from './dianyipai'

/** capture ws 厂商模块注册表：新厂商 = 模块文件 + 此处一行 */
const CAPTURE_VENDORS: Record<string, CaptureVendor> = {
  camsdk: camSdkVendor,
  dianyipai: dianyipaiVendor,
}

/** 按设备配置的 ws 协议查厂商模块（protocol 缺省 = 点易拍；未知协议返回 null 由通道报错） */
export function getCaptureVendor(protocol: string | undefined): CaptureVendor | null {
  return CAPTURE_VENDORS[protocol ?? 'dianyipai'] ?? null
}
