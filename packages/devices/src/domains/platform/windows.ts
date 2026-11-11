import type { DevicePlatform } from './device-platform'

/** Windows 平台能力：winspool 探测 + 全部厂商 DLL 的目标平台 */
export const windowsPlatform: DevicePlatform = {
  id: 'windows',
  nativeSupported: true,
  winspoolSupported: true,
}
