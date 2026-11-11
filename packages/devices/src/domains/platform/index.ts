import type { DevicePlatform } from './device-platform'
import process from 'node:process'
import { detectLinuxPlatform } from './linux'
import { macPlatform } from './mac'
import { windowsPlatform } from './windows'

export type { DevicePlatform, DevicePlatformId } from './device-platform'
export * from './host'

let cached: DevicePlatform | undefined

/** 平台探测单点：process.platform 分发；结果进程内缓存（平台运行期不变，linux 分支免重复读盘） */
export function detectDevicePlatform(): DevicePlatform {
  cached ??= detectUncached()
  return cached
}

function detectUncached(): DevicePlatform {
  if (process.platform === 'win32') {
    return windowsPlatform
  }
  if (process.platform === 'darwin') {
    return macPlatform
  }
  return detectLinuxPlatform()
}
