import type { Logger } from '../../logger/logger'
import type { DeviceHost } from '../host/device-host'
import type { IcCardReadRequest, IcCardReadResult, IcCardTextsWriteRequest, IcCardWriteRequest, IdCardAdapter, IdCardData, IdReaderDevice } from './types'
import { Buffer } from 'node:buffer'

import { DllIdAdapter } from './adapters/dll-adapter'
import { idCardError, toIdCardError } from './errors'

/** M1 每扇区块数（数据块地址 = 扇区号 × 4 + 块内序号） */
const SECTOR_BLOCKS = 4
/** M1 每扇区数据块数（末块为密钥控制块，不参与字符串组） */
const SECTOR_DATA_BLOCKS = 3
/** M1 数据块字节数 */
const BLOCK_BYTES = 16

/**
 * 文本 → 16 字节数据块 hex：UTF-8 编码、0x00 结尾并补齐整块。
 * 超长或含 0x00 的输入在进入原生调用前拒绝（0x00 会在读取截断时丢数据）。
 */
function encodeBlockText(text: string): string {
  const bytes = Buffer.from(text, 'utf8')
  if (bytes.length > BLOCK_BYTES) {
    throw idCardError('VALIDATION_FAILED', `字符串超出单块容量（UTF-8 ${bytes.length}/16 字节）`)
  }
  if (bytes.includes(0)) {
    throw idCardError('VALIDATION_FAILED', '字符串不得包含 0x00 字符')
  }
  const block = Buffer.alloc(BLOCK_BYTES)
  bytes.copy(block)
  return block.toString('hex').toUpperCase()
}

/** 16 字节块 hex → 文本：截至第一个 0x00 的字节按 UTF-8 解码（与 encodeBlockText 互逆） */
function decodeBlockText(hex: string): string {
  const bytes: number[] = []
  for (let i = 0; i + 1 < hex.length; i += 2) {
    const byte = Number.parseInt(hex.slice(i, i + 2), 16)
    if (Number.isNaN(byte) || byte === 0) {
      break
    }
    bytes.push(byte)
  }
  return new TextDecoder('utf-8').decode(new Uint8Array(bytes))
}

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

  /**
   * 读 IC 卡一个扇区：读块后派生字符串组 texts（数据块按 0x00 截断解码为 UTF-8、尾部空块不返回，
   * 与 writeIcTexts 的 texts 互逆），与原始块数据同一次会话返回。
   */
  async readIc(req: IcCardReadRequest & { deviceId: string }): Promise<IcCardReadResult> {
    try {
      const located = await this.locate(req?.deviceId)
      const data = await this.enqueue(this.lockKeyOf(located.device), () => located.adapter.readIc(located.device, req))
      const sector = req?.sector ?? 1
      const texts = Array.from({ length: SECTOR_DATA_BLOCKS }, (_, i) =>
        decodeBlockText(data.blocks[sector * SECTOR_BLOCKS + i] ?? ''))
      while (texts.length > 0 && texts[texts.length - 1] === '') {
        texts.pop()
      }
      return { ...data, texts }
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

  /**
   * 写扇区字符串组：texts 按序占用数据块，未占用的数据块清零（保证读取结果与本次写入一致）。
   * 整扇区写入在同一设备锁内完成；中途失败（如密钥认证不过）可能留下部分写入，重试即整扇区覆盖修复。
   */
  async writeIcTexts(req: IcCardTextsWriteRequest & { deviceId: string }): Promise<void> {
    try {
      const { sector, texts } = req ?? {}
      if (!Number.isInteger(sector) || sector < 0 || sector > 15) {
        throw idCardError('VALIDATION_FAILED', '扇区号不合法（应为 0-15）')
      }
      if (!Array.isArray(texts) || texts.some(text => typeof text !== 'string')) {
        throw idCardError('VALIDATION_FAILED', 'texts 应为字符串数组')
      }
      if (texts.length > SECTOR_DATA_BLOCKS) {
        throw idCardError('VALIDATION_FAILED', `字符串数量超出扇区数据块数（最多 ${SECTOR_DATA_BLOCKS} 个）`)
      }
      const located = await this.locate(req.deviceId)
      if (!located.device.capabilities.includes('iccard-write')) {
        throw idCardError('ADAPTER_UNAVAILABLE', `读卡器 ${located.device.displayName} 不支持 IC 卡写入`)
      }
      const blocks = [
        ...texts.map(encodeBlockText),
        ...Array.from({ length: SECTOR_DATA_BLOCKS - texts.length }, () => '00'.repeat(BLOCK_BYTES)),
      ]
      await this.enqueue(this.lockKeyOf(located.device), async () => {
        for (let i = 0; i < SECTOR_DATA_BLOCKS; i++) {
          await located.adapter.writeIc(located.device, {
            block: sector * SECTOR_BLOCKS + i,
            data: blocks[i],
            key: req.key,
            keyType: req.keyType,
          })
        }
      })
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
    for (const a of this.adapters.values()) { a.destroy?.() }
  }
}
