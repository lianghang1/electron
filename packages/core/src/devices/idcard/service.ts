import type { Logger } from '../../logger/logger'
import type { DeviceHost } from '../host/device-host'
import type { IcCardData, IcCardReadRequest, IcCardWriteRequest, IdCardAdapter, IdCardData, IdReaderDevice } from './types'

import { DllIdAdapter } from './adapters/dll-adapter'
import { idCardError, toIdCardError } from './errors'

/**
 * IdCardService = 证卡读取域统一 API（与 print/capture 同构）。
 * PII 红线：read/readIc 结果只经返回值传递；任何分支不得 console.log/落盘证件号或照片。
 * 日志注入：宿主传入 logger；模块内仅记录设备 ID 与结果状态，绝不记录证件数据。
 * 异常契约：失败抛 IdCardError（code 见 IdReaderErrorCode），IPC 层统一留痕后跨进程透传。
 */
export class IdCardService {
  private readonly adapters: Map<string, IdCardAdapter>
  /** 同一读卡器同一时刻只能执行一次读卡（硬件限制），按锁 key（设备或 lockGroup）串行化（身份证/IC 卡共享锁） */
  private locks = new Map<string, Promise<unknown>>()

  constructor(resourcesRoot: string, host: DeviceHost, private readonly logger: Logger) {
    this.adapters = new Map<string, IdCardAdapter>([
      // dll 路线经设备守护进程执行（koffi 调用崩溃隔离在 host 进程）
      ['dll', new DllIdAdapter(host, resourcesRoot)],
    ])
  }

  async listReaders(): Promise<IdReaderDevice[]> {
    const groups = await Promise.all([...this.adapters.values()].map(a => a.listReaders().catch(() => [])))
    return groups.flat()
  }

  async read(req: { deviceId: string }): Promise<IdCardData> {
    try {
      const located = await this.locate(req?.deviceId)
      return await this.enqueue(this.lockKeyOf(located.device), () => located.adapter.read(located.device))
    }
    catch (err) {
      throw this.logFailure(req?.deviceId, err)
    }
  }

  async readIc(req: IcCardReadRequest & { deviceId: string }): Promise<IcCardData> {
    try {
      const located = await this.locate(req?.deviceId)
      return await this.enqueue(this.lockKeyOf(located.device), () => located.adapter.readIc(located.device, req))
    }
    catch (err) {
      throw this.logFailure(req?.deviceId, err)
    }
  }

  /** 写 IC 卡单块：与读共用设备锁串行；写卡是覆盖性操作，驱动层强制拒绝密钥控制块/厂商块 */
  async writeIc(req: IcCardWriteRequest & { deviceId: string }): Promise<void> {
    try {
      const located = await this.locate(req?.deviceId)
      if (!located.device.capabilities.includes('iccard-write')) {
        throw idCardError('ADAPTER_UNAVAILABLE', `读卡器 ${located.device.displayName} 不支持 IC 卡写入`)
      }
      await this.enqueue(this.lockKeyOf(located.device), () => located.adapter.writeIc(located.device, req))
    }
    catch (err) {
      throw this.logFailure(req?.deviceId, err)
    }
  }

  /** 设备定位与状态校验（read/readIc 共用前置）：capability 是否匹配由适配器判（驱动声明为准） */
  private async locate(deviceId: string | undefined): Promise<{ adapter: IdCardAdapter, device: IdReaderDevice }> {
    if (!deviceId) {
      throw idCardError('VALIDATION_FAILED', '缺少 deviceId')
    }
    const transport = deviceId.split(':')[0]
    const adapter = this.adapters.get(transport)
    if (!adapter) {
      throw idCardError('ADAPTER_UNAVAILABLE', `未知接入方式: ${transport}`)
    }
    const readers = await adapter.listReaders()
    const device = readers.find(d => d.id === deviceId)
    if (!device) {
      throw idCardError('DEVICE_NOT_FOUND', `未找到读卡器: ${deviceId}`)
    }
    if (device.status !== 'ready') {
      throw idCardError(
        device.status === 'unavailable' ? 'ADAPTER_UNAVAILABLE' : 'DEVICE_OFFLINE',
        `读卡器不可用: ${String(device.meta.note ?? device.status)}`,
      )
    }
    return { adapter, device }
  }

  /** 锁 key：驱动使用进程级全局资源（如 chdir）时按 lockGroup 跨设备互斥，其余按设备 ID 串行 */
  private lockKeyOf(device: IdReaderDevice): string {
    return (device.meta as { lockGroup?: string } | undefined)?.lockGroup ?? device.id
  }

  /** 同锁 key 串行化执行（链上已 catch，永不 reject 由调用方保证） */
  private enqueue<R>(lockKey: string, run: () => Promise<R> | R): Promise<R> {
    const prev = this.locks.get(lockKey) ?? Promise.resolve()
    const task = prev.then(() => run())
    this.locks.set(lockKey, task.catch(() => undefined))
    return task
  }

  /** 失败留痕（设备 ID + 错误码，不含证件数据）后原样抛出 */
  private logFailure(deviceId: string | undefined, err: unknown): unknown {
    const ce = toIdCardError(err)
    this.logger.error(`读卡失败 ${deviceId ?? '(未指定)'}`, { code: ce.code, message: ce.message })
    return err
  }

  destroy(): void {
    for (const a of this.adapters.values()) a.destroy?.()
  }
}
