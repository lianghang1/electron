import type { Logger } from '../../logger/logger'
import type { IcCardReadRequest, IcCardWriteRequest, IcCardWriteResult, IcReaderResult, IdCardAdapter, IdReaderDevice, IdReaderErrorCode, IdReaderResult } from './types'

import { DllIdAdapter } from './adapters/dll-adapter'
import { StubIdAdapter } from './adapters/stub-adapter'
import { toIdCardError } from './errors'

/**
 * IdCardService = 证卡读取域统一 API（与 print/capture 同构）。
 * PII 红线：read/readIc 结果只经返回值传递；任何分支不得 console.log/落盘证件号或照片。
 * 日志注入：宿主传入 logger；模块内仅记录设备 ID 与结果状态，绝不记录证件数据。
 */
export class IdCardService {
  private readonly adapters: Map<string, IdCardAdapter>
  /** 同一读卡器同一时刻只能执行一次读卡（硬件限制），按锁 key（设备或 lockGroup）串行化（身份证/IC 卡共享锁） */
  private locks = new Map<string, Promise<unknown>>()

  constructor(resourcesRoot: string, private readonly logger: Logger, mock = false) {
    this.adapters = new Map<string, IdCardAdapter>([
      ['dll', new DllIdAdapter(resourcesRoot)],
    ])
    // mock 读卡器追加在真实适配器之后：自动选设备时真实硬件优先，无硬件时 stub 兜底
    if (mock) {
      this.adapters.set('stub', new StubIdAdapter())
    }
  }

  async listReaders(): Promise<IdReaderDevice[]> {
    const groups = await Promise.all([...this.adapters.values()].map(a => a.listReaders().catch(() => [])))
    return groups.flat()
  }

  async read(req: { deviceId: string }): Promise<IdReaderResult> {
    try {
      const located = await this.locate(req?.deviceId)
      if (!located.ok) {
        return { ok: false, error: { code: located.code, message: located.message } }
      }
      return await this.enqueue(this.lockKeyOf(located.device), () => located.adapter.read(located.device))
    }
    catch (err) {
      return this.fail(req?.deviceId, err)
    }
  }

  async readIc(req: IcCardReadRequest & { deviceId: string }): Promise<IcReaderResult> {
    try {
      const located = await this.locate(req?.deviceId)
      if (!located.ok) {
        return { ok: false, error: { code: located.code, message: located.message } }
      }
      return await this.enqueue(this.lockKeyOf(located.device), () => located.adapter.readIc(located.device, req))
    }
    catch (err) {
      return this.fail(req?.deviceId, err)
    }
  }

  /** 写 IC 卡单块：与读共用设备锁串行；写卡是覆盖性操作，驱动层强制拒绝密钥控制块/厂商块 */
  async writeIc(req: IcCardWriteRequest & { deviceId: string }): Promise<IcCardWriteResult> {
    try {
      const located = await this.locate(req?.deviceId)
      if (!located.ok) {
        return { ok: false, error: { code: located.code, message: located.message } }
      }
      if (!located.device.capabilities.includes('iccard-write')) {
        return { ok: false, error: { code: 'ADAPTER_UNAVAILABLE', message: `读卡器 ${located.device.displayName} 不支持 IC 卡写入` } }
      }
      return await this.enqueue(this.lockKeyOf(located.device), () => located.adapter.writeIc(located.device, req))
    }
    catch (err) {
      return this.fail(req?.deviceId, err)
    }
  }

  /** 设备定位与状态校验（read/readIc 共用前置）：capability 是否匹配由适配器判（驱动声明为准） */
  private async locate(deviceId: string | undefined): Promise<{ ok: true, adapter: IdCardAdapter, device: IdReaderDevice } | { ok: false, code: IdReaderErrorCode, message: string }> {
    if (!deviceId) {
      return { ok: false, code: 'VALIDATION_FAILED', message: '缺少 deviceId' }
    }
    const transport = deviceId.split(':')[0]
    const adapter = this.adapters.get(transport)
    if (!adapter) {
      return { ok: false, code: 'ADAPTER_UNAVAILABLE', message: `未知接入方式: ${transport}` }
    }
    const readers = await adapter.listReaders()
    const device = readers.find(d => d.id === deviceId)
    if (!device) {
      return { ok: false, code: 'DEVICE_NOT_FOUND', message: `未找到读卡器: ${deviceId}` }
    }
    if (device.status !== 'ready') {
      return {
        ok: false,
        code: device.status === 'unavailable' ? 'ADAPTER_UNAVAILABLE' : 'DEVICE_OFFLINE',
        message: `读卡器不可用: ${String(device.meta.note ?? device.status)}`,
      }
    }
    return { ok: true, adapter, device }
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

  /** 失败结果（无 data，形状与 IdReaderResult/IcReaderResult 的 error 同构，两种返回类型通用） */
  private fail(deviceId: string | undefined, err: unknown): { ok: false, error: NonNullable<IdReaderResult['error']> } {
    const ce = toIdCardError(err)
    this.log('error', `读卡失败 ${deviceId ?? '(未指定)'}`, { code: ce.code })
    return { ok: false, error: { code: ce.code, message: ce.message, detail: ce.detail } }
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

  destroy(): void {
    for (const a of this.adapters.values()) a.destroy?.()
  }
}
