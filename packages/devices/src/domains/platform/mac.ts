import type { DevicePlatform } from './device-platform'

/** macOS 平台：native 对接 dylib + koffi，winspool 不适用；厂商接入按此形状扩展 */
export const macPlatform: DevicePlatform = {
  id: 'mac',
  nativeSupported: true,
  winspoolSupported: false,
}
