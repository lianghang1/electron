import type { IccardConfig, IccardDeviceOverrides, IcReaderDeviceConfig } from '@shell/shared'
import type { Logger } from '@shell/kernel/logger'
import type { DeviceHost } from '../../host/device-host'
import type { IcCardAdapter, IcCardReadRequest, IcCardReadResult, IcCardTextsWriteRequest, IcCardWriteRequest, IcReaderDevice } from './types'
import { Buffer } from 'node:buffer'

import { createDeviceStore } from '../../storage/device-store'
import { deviceLockKey, SerialLocks } from '../../kernel/serial-lock'
import { DllIcAdapter } from './adapters/dll-adapter'
import { BUILT_IN_ICCARD_CONFIGS } from './configs'
import { icCardError, toIcCardError } from './errors'

/**
 * 持久化根对象（electron-store 根必须为对象，数组经 devices 包一层）。
 * devices 现为白名单覆盖（仅现场可调字段）；历史版本存过整条档案，
 * 白名单提取按同名字段读取，多余字段（旧 dll 段等）自然忽略。
 */
interface StoredIccardConfig {
  devices?: IccardDeviceOverrides[]
}

/** 档案深拷贝（出厂合并/读出 clone，避免共享内层对象被运行时误改） */
function cloneProfile(p: IcReaderDeviceConfig): IcReaderDeviceConfig {
  return p.transport === 'ws' ? { ...p, ws: { ...p.ws } } : { ...p }
}

/** 档案 → 白名单覆盖（持久化只写现场可调字段，技术字段永远随代码出厂） */
function overridesOf(p: IcReaderDeviceConfig): IccardDeviceOverrides {
  return p.transport === 'ws'
    ? { id: p.id, displayName: p.displayName, ws: { url: p.ws.url } }
    : { id: p.id, displayName: p.displayName }
}

/**
 * 历史持久化合并 + 白名单提取：以出厂整条为基准，stored 同 id 仅提取白名单字段
 * （displayName / ws.url）覆盖——代码修改任何技术字段（品牌/接入方式/驱动）立即生效，
 * 本地旧数据不再整体压住出厂值。清单完全由代码预设决定（不回注用户追加档案）。
 */
function migrateConfig(raw: StoredIccardConfig): IcReaderDeviceConfig[] {
  const stored = Array.isArray(raw.devices) ? raw.devices : []
  return BUILT_IN_ICCARD_CONFIGS.map((b) => {
    const profile = cloneProfile(b)
    const s = stored.find(x => x.id === b.id)
    if (s) {
      if (typeof s.displayName === 'string' && s.displayName.trim()) {
        profile.displayName = s.displayName
      }
      if (profile.transport === 'ws' && typeof s.ws?.url === 'string' && s.ws.url.trim()) {
        profile.ws.url = s.ws.url
      }
    }
    return profile
  })
}

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
    throw icCardError('VALIDATION_FAILED', `字符串超出单块容量（UTF-8 ${bytes.length}/16 字节）`)
  }
  if (bytes.includes(0)) {
    throw icCardError('VALIDATION_FAILED', '字符串不得包含 0x00 字符')
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
 * IcCardService = M1 IC 卡读写域统一 API（与 print/capture/idcard 同构）。
 * 数据红线：卡块数据可能承载业务敏感信息，只经返回值传递，任何分支不得写日志。
 * 异常契约：失败抛 IcCardError（code 见 IcCardErrorCode），IPC 层统一留痕后跨进程透传。
 */
export class IcCardService {
  private readonly adapters: Map<string, IcCardAdapter>
  /** 同一读卡器同一时刻只能执行一次读写（硬件限制），按锁 key（设备或 lockGroup）串行化 */
  private readonly locks = new SerialLocks()
  /** 设备档案（ws/dll 双路线，见 configs.ts；写穿 device-iccard.json，读侧内存直取） */
  private configs: IccardConfig
  private readonly configStore = createDeviceStore<StoredIccardConfig>('iccard')

  constructor(resourcesRoot: string, host: DeviceHost, private readonly logger: Logger) {
    this.configs = migrateConfig(this.configStore.load())
    this.adapters = new Map<string, IcCardAdapter>([
      // dll 路线经设备守护进程执行（koffi 调用崩溃隔离在 host 进程），档案驱动枚举
      ['dll', new DllIcAdapter(host, resourcesRoot, () => this.configs)],
    ])
  }

  getConfig(): IccardConfig {
    return this.configs.map(cloneProfile)
  }

  /** 现场白名单覆盖（档案 id 必须为出厂预设项；入参合法性由 IPC 层 sanitize），写穿持久化 */
  setConfig(id: string, overrides: IccardDeviceOverrides): IccardConfig {
    if (!this.configs.some(p => p.id === id)) {
      throw icCardError('VALIDATION_FAILED', `设备档案不存在: ${id}`)
    }
    const merged = this.configs.map((p) => {
      if (p.id !== id) {
        return p
      }
      const next = cloneProfile(p)
      if (typeof overrides.displayName === 'string' && overrides.displayName.trim()) {
        next.displayName = overrides.displayName
      }
      if (next.transport === 'ws' && typeof overrides.ws?.url === 'string' && overrides.ws.url.trim()) {
        next.ws.url = overrides.ws.url
      }
      return next
    })
    return this.writeThrough(merged)
  }

  private writeThrough(configs: IccardConfig): IccardConfig {
    this.configs = configs
    this.configStore.save({ devices: configs.map(overridesOf) })
    return this.getConfig()
  }

  async listReaders(): Promise<IcReaderDevice[]> {
    const groups = await Promise.all([...this.adapters.values()].map(a => a.listReaders().catch(() => [])))
    return groups.flat()
  }

  /**
   * 读 IC 卡一个扇区：读块后派生字符串组 texts（数据块按 0x00 截断解码为 UTF-8、尾部空块不返回，
   * 与 writeIcTexts 的 texts 互逆），与原始块数据同一次会话返回。
   */
  async readIc(req: IcCardReadRequest & { deviceId: string }): Promise<IcCardReadResult> {
    try {
      const located = await this.locate(req?.deviceId)
      const data = await this.locks.run(deviceLockKey(located.device), () => located.adapter.readIc(located.device, req))
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
        throw icCardError('ADAPTER_UNAVAILABLE', `读卡器 ${located.device.displayName} 不支持 IC 卡写入`)
      }
      await this.locks.run(deviceLockKey(located.device), () => located.adapter.writeIc(located.device, req))
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
        throw icCardError('VALIDATION_FAILED', '扇区号不合法（应为 0-15）')
      }
      if (!Array.isArray(texts) || texts.some(text => typeof text !== 'string')) {
        throw icCardError('VALIDATION_FAILED', 'texts 应为字符串数组')
      }
      if (texts.length > SECTOR_DATA_BLOCKS) {
        throw icCardError('VALIDATION_FAILED', `字符串数量超出扇区数据块数（最多 ${SECTOR_DATA_BLOCKS} 个）`)
      }
      const located = await this.locate(req.deviceId)
      if (!located.device.capabilities.includes('iccard-write')) {
        throw icCardError('ADAPTER_UNAVAILABLE', `读卡器 ${located.device.displayName} 不支持 IC 卡写入`)
      }
      const blocks = [
        ...texts.map(encodeBlockText),
        ...Array.from({ length: SECTOR_DATA_BLOCKS - texts.length }, () => '00'.repeat(BLOCK_BYTES)),
      ]
      await this.locks.run(deviceLockKey(located.device), async () => {
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

  /** 设备定位与状态校验（读写共用前置）：写卡能力在写路径单独校验（capabilities 以 listReaders 为准） */
  private async locate(deviceId: string | undefined): Promise<{ adapter: IcCardAdapter, device: IcReaderDevice }> {
    if (!deviceId) {
      throw icCardError('VALIDATION_FAILED', '缺少 deviceId')
    }
    const transport = deviceId.split(':')[0]
    const adapter = this.adapters.get(transport)
    if (!adapter) {
      throw icCardError('ADAPTER_UNAVAILABLE', `未知接入方式: ${transport}`)
    }
    const readers = await adapter.listReaders()
    const device = readers.find(d => d.id === deviceId)
    if (!device) {
      throw icCardError('DEVICE_NOT_FOUND', `未找到读卡器: ${deviceId}`)
    }
    if (device.status !== 'ready') {
      throw icCardError(
        device.status === 'unavailable' ? 'ADAPTER_UNAVAILABLE' : 'DEVICE_OFFLINE',
        `读卡器不可用: ${String(device.meta.note ?? device.status)}`,
      )
    }
    return { adapter, device }
  }

  /** 失败留痕（设备 ID + 错误码 + 驱动阶段信息，不含卡数据）后原样抛出 */
  private logFailure(deviceId: string | undefined, err: unknown): unknown {
    const ce = toIcCardError(err)
    this.logger.error(`IC 卡读写失败 ${deviceId ?? '(未指定)'}`, { code: ce.code, message: ce.message, ...(ce.detail !== undefined ? { detail: ce.detail } : {}) })
    return err
  }

  destroy(): void {
    for (const a of this.adapters.values()) { a.destroy?.() }
  }
}
