import type { DeviceHost } from '../../host/device-host'
import type { SignAdapter, SignDevice, SignSessionResult, SignStartResult, SignStrokePoint } from '../types'
import { signatureError } from '../errors'

/**
 * DLL 路线签名适配器（汉王 SPTabletSign.dll，x64，会话式纯取点库）。
 *
 * SDK 未随 DLL 提供手册/头文件（来源：飞信 v2，仅打包 DLL），SPRegisterPenInfoCallBack
 * 回调原型与入口参数表未确认——koffi.register 原型若与实际不符属未定义行为（可能进程崩溃）。
 * 故设备探测（DLL 就位检测）收敛进设备守护进程（host RPC，本适配器零原生依赖），
 * start 会话返回 PROTOCOL_PENDING 明确错误；拿到 SDK 手册后在守护进程侧
 * （host/run.ts signature 域方法表 + vendors/hanvon.ts）补齐原生调用与笔迹回调，
 * 契约层（会话 / 实时推送 / 笔迹回收）已就绪，无需改动。
 */
export class DllSignAdapter implements SignAdapter {
  readonly transport = 'dll' as const

  constructor(
    private readonly host: DeviceHost,
    private readonly resourcesRoot: string,
  ) {}

  async listDevices(): Promise<SignDevice[]> {
    return this.host.request<SignDevice[]>('signature.listDevices', { resourcesRoot: this.resourcesRoot })
  }

  async start(_device: SignDevice, _onStroke: (point: SignStrokePoint) => void): Promise<SignStartResult> {
    throw signatureError('PROTOCOL_PENDING', '汉王签名回调协议待真机实测（SPRegisterPenInfoCallBack 原型未验证），暂未启用原生会话')
  }

  async stop(): Promise<SignSessionResult> {
    throw signatureError('SESSION_NOT_ACTIVE', '无进行中的签名会话')
  }

  async clear(): Promise<void> {
    throw signatureError('SESSION_NOT_ACTIVE', '无进行中的签名会话')
  }

  async cancel(): Promise<void> {
    throw signatureError('SESSION_NOT_ACTIVE', '无进行中的签名会话')
  }
}
