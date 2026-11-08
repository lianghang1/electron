import type { DevicePlatform } from './platform-types'
import { readFileSync } from 'node:fs'

/** 国产化 Linux 发行版标识（/etc/os-release 的 ID/ID_LIKE 命中即判 linux-cn） */
const CN_LINUX_RELEASE_IDS = ['deepin', 'uos', 'kylin', 'openkylin', 'neokylin'] as const

function detectLinuxCn(): boolean {
  try {
    const osRelease = readFileSync('/etc/os-release', 'utf-8')
    return CN_LINUX_RELEASE_IDS.some(id => osRelease.includes(id))
  }
  catch {
    return false
  }
}

/** Linux 平台：native 对接 so，winspool 不适用；国产化发行版按适配差异扩展 */
export function detectLinuxPlatform(): DevicePlatform {
  return {
    id: detectLinuxCn() ? 'linux-cn' : 'linux',
    nativeSupported: true,
    winspoolSupported: false,
  }
}
