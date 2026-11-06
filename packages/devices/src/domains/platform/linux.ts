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

/** Linux 骨架：native 对接面预留（so），winspool 不适用；国产化发行版细分供适配差异预留 */
export function detectLinuxPlatform(): DevicePlatform {
  return {
    id: detectLinuxCn() ? 'linux-cn' : 'linux',
    nativeSupported: true,
    winspoolSupported: false,
  }
}
