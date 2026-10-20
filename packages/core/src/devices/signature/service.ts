import type { Logger } from '../../logger/logger'
import type { DeviceHost } from '../host/device-host'
import type { SignAdapter, SignDevice, SignSessionResult, SignStartResult, SignStrokePoint } from './types'

import { DllSignAdapter } from './adapters/dll-adapter'
import { signatureError, toSignatureError } from './errors'

/**
 * SignatureService = 手写签名域统一 API（与 IdCardService 同构的归一化层）。
 * 会话约束：一个签名板同时只有一个会话，由本层集中持有（适配器各自兜底校验）。
 * 笔迹点只经 onStroke 回调转发给会话发起方（ipc 层绑定 webContents.send 推送），
 * 不写日志（板面笔迹视同用户输入内容）。失败统一抛 SignatureError。
 */
export class SignatureService {
  private readonly adapters: Map<string, SignAdapter>
  /** 活动会话：设备 ID + 发起方的笔迹推送回调 */
  private active: { deviceId: string, onStroke: (point: SignStrokePoint) => void } | null = null

  constructor(host: DeviceHost, resourcesRoot: string, private readonly logger: Logger) {
    this.adapters = new Map<string, SignAdapter>([
      ['dll', new DllSignAdapter(host, resourcesRoot)],
    ])
  }

  async listDevices(): Promise<SignDevice[]> {
    const groups = await Promise.all([...this.adapters.values()].map(a => a.listDevices().catch(() => [])))
    return groups.flat()
  }

  /** 开始会话：deviceId 缺省自动选第一个就绪设备；onStroke = 发起方的实时笔迹回调 */
  async start(req: { deviceId?: string } | undefined, onStroke: (point: SignStrokePoint) => void): Promise<SignStartResult> {
    try {
      const devices = await this.listDevices()
      const deviceId = req?.deviceId ?? devices.find(d => d.status === 'ready')?.id
      if (!deviceId) {
        throw signatureError('DEVICE_NOT_FOUND', '无可用签名设备')
      }
      const adapter = this.adapters.get(deviceId.split(':')[0])
      if (!adapter) {
        throw signatureError('ADAPTER_UNAVAILABLE', `未知接入方式: ${deviceId.split(':')[0]}`)
      }
      const device = devices.find(d => d.id === deviceId)
      if (!device) {
        throw signatureError('DEVICE_NOT_FOUND', `未找到签名设备: ${deviceId}`)
      }
      if (this.active) {
        throw signatureError('SESSION_ACTIVE', '签名会话进行中（先 stopSign/cancelSign）')
      }
      if (device.status !== 'ready') {
        throw signatureError(
          device.status === 'unavailable' ? 'ADAPTER_UNAVAILABLE' : 'DEVICE_OFFLINE',
          `签名设备不可用: ${String(device.meta.note ?? device.status)}`,
        )
      }
      // 先挂会话再启动：start 期间到达的首个笔迹点不丢；失败路径回滚
      this.active = { deviceId, onStroke }
      const result = await adapter.start(device, p => this.routeStroke(p))
      this.log('info', `签名会话开始 ${deviceId}`)
      return result
    }
    catch (err) {
      this.active = null
      const ce = toSignatureError(err)
      this.log('error', '签名会话启动失败', { code: ce.code })
      throw ce
    }
  }

  /** 结束会话并回收完整笔迹（无会话抛 SESSION_NOT_ACTIVE） */
  async stop(): Promise<SignSessionResult> {
    const adapter = this.activeAdapter()
    if (!adapter) {
      throw signatureError('SESSION_NOT_ACTIVE', '无进行中的签名会话')
    }
    try {
      const result = await adapter.stop()
      this.active = null
      this.log('info', `签名会话结束: ${result.strokeCount} 笔画`)
      return result
    }
    catch (err) {
      this.active = null
      throw toSignatureError(err)
    }
  }

  async clear(): Promise<void> {
    const adapter = this.activeAdapter()
    if (!adapter) {
      throw signatureError('SESSION_NOT_ACTIVE', '无进行中的签名会话')
    }
    await adapter.clear()
  }

  async cancel(): Promise<void> {
    const adapter = this.activeAdapter()
    if (!adapter) {
      throw signatureError('SESSION_NOT_ACTIVE', '无进行中的签名会话')
    }
    await adapter.cancel()
    this.active = null
    this.log('info', '签名会话取消')
  }

  destroy(): void {
    for (const a of this.adapters.values()) { a.destroy?.() }
    this.active = null
  }

  private activeAdapter(): SignAdapter | null {
    if (!this.active) {
      return null
    }
    return this.adapters.get(this.active.deviceId.split(':')[0]) ?? null
  }

  private routeStroke(point: SignStrokePoint): void {
    this.active?.onStroke(point)
  }

  private log(level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>): void {
    if (level === 'info') {
      this.logger.info(`${message}`, meta)
    }
    else if (level === 'warn') {
      this.logger.warn(`${message}`, meta)
    }
    else if (level === 'error') {
      this.logger.error(`${message}`, meta)
    }
  }
}
