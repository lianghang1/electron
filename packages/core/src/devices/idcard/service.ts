import type { Logger } from '../../logger/logger'
import type { IdCardAdapter, IdReaderDevice, ReadResult } from './types'

import { DllIdAdapter } from './adapters/dll-adapter'
// import { StubIdAdapter } from './adapters/stub-adapter'
import { toIdCardError } from './errors'

/**
 * IdCardService = 证卡读取域统一 API（与 print/capture 同构）。
 * PII 红线：read 结果只经返回值传递；任何分支不得 console.log/落盘证件号或照片。
 * 日志注入：宿主传入 logger；模块内仅记录设备 ID 与结果状态，绝不记录证件数据。
 */
export class IdCardService {
  private readonly adapters: Map<string, IdCardAdapter>
  /** 同一读卡器同一时刻只能执行一次读卡（硬件限制），按设备串行化 */
  private locks = new Map<string, Promise<unknown>>()

  constructor(resourcesRoot: string, private readonly logger: Logger) {
    this.adapters = new Map<string, IdCardAdapter>([
      // ['stub', new StubIdAdapter()],
      ['dll', new DllIdAdapter(resourcesRoot)],
    ])
  }

  async listReaders(): Promise<IdReaderDevice[]> {
    const groups = await Promise.all([...this.adapters.values()].map(a => a.listReaders().catch(() => [])))
    return groups.flat()
  }

  async read(req: { deviceId: string }): Promise<ReadResult> {
    try {
      if (!req?.deviceId) {
        return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少 deviceId' } }
      }
      const transport = req.deviceId.split(':')[0]
      const adapter = this.adapters.get(transport)
      if (!adapter) {
        return { ok: false, error: { code: 'ADAPTER_UNAVAILABLE', message: `未知接入方式: ${transport}` } }
      }
      const readers = await adapter.listReaders()
      const device = readers.find(d => d.id === req.deviceId)
      if (!device) {
        return { ok: false, error: { code: 'DEVICE_NOT_FOUND', message: `未找到读卡器: ${req.deviceId}` } }
      }
      if (device.status !== 'ready') {
        return {
          ok: false,
          error: {
            code: device.status === 'unavailable' ? 'ADAPTER_UNAVAILABLE' : 'DEVICE_OFFLINE',
            message: `读卡器不可用: ${String(device.meta.note ?? device.status)}`,
          },
        }
      }
      // 串行化：同一设备上的读卡排队执行（链上已 catch，永不 reject）
      const prev = this.locks.get(req.deviceId) ?? Promise.resolve()
      const task = prev.then(() => adapter.read(device))
      this.locks.set(req.deviceId, task.catch(() => undefined))
      return await task
    }
    catch (err) {
      const ce = toIdCardError(err)
      this.log('error', `读卡失败 ${req.deviceId}`, { code: ce.code })
      return { ok: false, error: { code: ce.code as never, message: ce.message, detail: ce.detail } }
    }
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
