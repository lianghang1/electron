import type { SignDevice } from '../device-contracts'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** 汉王签名屏 DLL 出厂位置（相对宿主资源根，x64，来源：飞信 v2 随包 DLL） */
export const HANVON_DLL_FILE = 'devices/signature/hanvon/win64/SPTabletSign.dll'

/**
 * 汉王 DLL 就位探测（在设备守护进程内执行）。
 * DLL 在 → unavailable（SPRegisterPenInfoCallBack 回调原型未经 SDK 手册确认，koffi.register
 * 原型不符属未定义行为，不能声明 ready）；DLL 缺 → offline。
 * 拿到 SDK 手册后在守护进程 signature 域方法表补原生会话，探测状态随之改为 ready。
 */
export function probeHanvonDevice(resourcesRoot: string): SignDevice {
  const present = existsSync(join(resourcesRoot, HANVON_DLL_FILE))
  return {
    id: 'dll:hanvon',
    displayName: '汉王签名屏（SPTabletSign）',
    brand: '汉王',
    transport: 'dll',
    status: present ? 'unavailable' : 'offline',
    meta: {
      dllFile: HANVON_DLL_FILE,
      note: present
        ? 'DLL 已就位；笔迹回调协议待真机实测（需 SDK 手册确认 SPRegisterPenInfoCallBack 原型），暂不可用'
        : 'DLL 未就位（放置 SDK 目录后刷新）',
    },
  }
}
