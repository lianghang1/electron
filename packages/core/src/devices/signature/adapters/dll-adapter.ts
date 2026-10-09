import type { SignActionResult, SignAdapter, SignDevice, SignSessionResult, SignStartResult, SignStrokePoint } from '../types'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * DLL 路线签名适配器（汉王 SPTabletSign.dll，x64，会话式纯取点库）。
 *
 * SDK 未随 DLL 提供手册/头文件（来源：飞信 v2，仅打包 DLL），以下无法确认：
 *   1. SPRegisterPenInfoCallBack 的回调原型（参数个数/含义/压感范围）——koffi.register
 *      原型若与实际不符属未定义行为（可能进程崩溃）；
 *   2. OpenDevice 等入口的参数表与返回码。
 * 故本适配器只做 DLL 就位检测，start 会话返回 PROTOCOL_PENDING 明确错误，不做任何原生调用；
 * 拿到 SDK 手册后在 start() 补齐原生调用与笔迹回调即可，
 * 契约层（会话 / 实时推送 / 笔迹回收）已就绪，无需改动。
 */
const DLL_FILE = 'devices/hanvon/SPTabletSign.dll'

export class DllSignAdapter implements SignAdapter {
  readonly transport = 'dll' as const

  private readonly dllPath: string

  constructor(resourcesRoot: string) {
    this.dllPath = join(resourcesRoot, DLL_FILE)
  }

  async listDevices(): Promise<SignDevice[]> {
    const present = existsSync(this.dllPath)
    return [
      {
        id: `${this.transport}:hanvon`,
        displayName: '汉王签名屏（SPTabletSign）',
        brand: '汉王',
        transport: this.transport,
        // DLL 在但回调协议未确认 → 不能声明 ready（unavailable = 不可用原因见 note）
        status: present ? 'unavailable' : 'offline',
        meta: {
          dllFile: DLL_FILE,
          note: present
            ? 'DLL 已就位；笔迹回调协议待真机实测（需 SDK 手册确认 SPRegisterPenInfoCallBack 原型），暂不可用'
            : 'DLL 未就位（放置 SDK 目录后刷新）',
        },
      },
    ]
  }

  async start(_device: SignDevice, _onStroke: (point: SignStrokePoint) => void): Promise<SignStartResult> {
    return {
      ok: false,
      error: {
        code: 'PROTOCOL_PENDING',
        message: '汉王签名回调协议待真机实测（SPRegisterPenInfoCallBack 原型未验证），暂未启用原生会话',
      },
    }
  }

  async stop(): Promise<SignSessionResult> {
    return { ok: false, error: { code: 'SESSION_NOT_ACTIVE', message: '无进行中的签名会话' } }
  }

  async clear(): Promise<SignActionResult> {
    return { ok: false, error: { code: 'SESSION_NOT_ACTIVE', message: '无进行中的签名会话' } }
  }

  async cancel(): Promise<SignActionResult> {
    return { ok: false, error: { code: 'SESSION_NOT_ACTIVE', message: '无进行中的签名会话' } }
  }
}
