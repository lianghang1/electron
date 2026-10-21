import type { SignAdapter, SignDevice, SignSessionResult, SignStartResult, SignStrokePoint } from '../types'
import { signatureError } from '../errors'
import { CAMSDK_WS_PAD, CamSdkPadSession, probeCamSdkPad } from '../vendors/camsdk-pad'

/**
 * ws 路线签名适配器（CamSDK 签名屏 PadViewer4，签名域）。
 * 主进程直连 ws（纯 JSON 文本帧协议、无 native 依赖），不经设备守护进程。
 * 设备侧产位图模式：签名图/指纹图由 PadViewer 回推（strokes 恒空），笔迹点回调不使用。
 * 厂商会话协议内聚 vendors/camsdk-pad.ts（与 idcard/capture 域同构的厂商拆分）。
 */
export class WsSignAdapter implements SignAdapter {
  readonly transport = 'ws' as const

  /** 活动会话（签名屏一次只允许一个会话，service 层另有集中互斥） */
  private session: CamSdkPadSession | null = null

  constructor(private readonly getUrl: () => string) {}

  async listDevices(): Promise<SignDevice[]> {
    const url = this.getUrl()
    const alive = await probeCamSdkPad(url)
    return [{
      id: CAMSDK_WS_PAD.id,
      displayName: CAMSDK_WS_PAD.displayName,
      brand: CAMSDK_WS_PAD.brand,
      transport: 'ws',
      status: alive ? 'ready' : 'offline',
      meta: {
        url,
        note: alive ? '本地服务运行中（签字&指纹一体流程）' : 'CamSDKServer 未运行（需安装 CamSDK 服务端）',
      },
    }]
  }

  /** 开始会话：拉起 PadViewer4 → 内置签字页（签名+指纹）。结果经 stop/waitForResult 交付 */
  async start(device: SignDevice, _onStroke: (point: SignStrokePoint) => void): Promise<SignStartResult> {
    if (device.status !== 'ready') {
      throw signatureError('DEVICE_OFFLINE', `签名设备不可用: ${String(device.meta.note ?? device.status)}`)
    }
    if (this.session) {
      throw signatureError('SESSION_ACTIVE', '签名会话进行中（先 stopSign/cancelSign）')
    }
    const session = new CamSdkPadSession()
    try {
      await session.open()
    }
    catch (err) {
      session.close()
      throw err
    }
    this.session = session
    // 板面尺寸即签字页交互区（渲染层 bitmap 模式不依赖该值作画布，仅作展示口径）
    return { width: 800, height: 600, meta: { mode: 'bitmap', url: this.getUrl() } }
  }

  /** 结束会话：等待 PadViewer 回推结果（签名屏提交后自动回传），限时 15s */
  async stop(): Promise<SignSessionResult> {
    const session = this.takeSession()
    if (!session) {
      throw signatureError('SESSION_NOT_ACTIVE', '无进行中的签名会话')
    }
    try {
      const result = await session.waitForResult(15000)
      return {
        strokeCount: 0,
        strokes: [],
        width: 800,
        height: 600,
        signImageDataUrl: result.signImageDataUrl,
        fingerImageDataUrl: result.fingerImageDataUrl,
        meta: { mode: 'bitmap' },
      }
    }
    finally {
      session.close()
    }
  }

  async clear(): Promise<void> {
    throw signatureError('ADAPTER_UNAVAILABLE', '签名屏不支持远程清板（请在签名屏上重写）')
  }

  async cancel(): Promise<void> {
    const session = this.takeSession()
    session?.cancel()
  }

  destroy(): void {
    this.session?.close()
    this.session = null
  }

  /** 摘取活动会话（原子性：取出后置空，重复 stop/cancel 不复用旧会话） */
  private takeSession(): CamSdkPadSession | null {
    const session = this.session
    this.session = null
    return session
  }
}
