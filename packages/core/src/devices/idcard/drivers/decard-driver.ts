/* eslint-disable node/prefer-global/buffer */
import type { BrandDriver, IcCardData, IcCardReadRequest, IcCardWriteRequest } from '../types'
import type { KoffiFn, KoffiLib } from './koffi'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { idCardError } from '../errors'
import { requireKoffi } from './koffi'

/**
 * 德卡 IC 卡读卡器驱动（dcrf32.dll，Mifare Classic 全系列通用 API，返回码 0 = 成功）。
 *
 * DLL（resources/devices/decard/dcrf32.dll，x64）。调用流程：
 *   dc_init(port, baud)          打开设备 → 句柄（1001-1016 = USB，1-16 = 串口）
 *        ↓
 *   dc_request(1)                寻卡（1 = ISO14443A）
 *        ↓
 *   dc_anticoll(0)               防碰撞 → 卡 UID（4 字节）
 *        ↓
 *   dc_select                    选卡
 *        ↓
 *   dc_authentication_pass(mode, sector, key)  密钥认证（0 = A 键 / 4 = B 键，一步完成装 key + 验证）
 *        ↓
 *   dc_read(addr)                读数据块（每扇区 4 块：3 数据 + 1 密钥控制块，控制块不回读）
 *        ↓
 *   dc_beep / dc_exit
 *
 * 数据红线：卡块数据可能承载业务敏感信息，不得写日志。
 */

/** 出厂白键（未改卡时的默认 A/B 键） */
const DEFAULT_KEY = 'FFFFFFFFFFFF'
/** 每扇区块数（Mifare Classic 1K：16 扇区 × 4 块，每块 16 字节） */
const BLOCKS_PER_SECTOR = 4
/** 每扇区数据块数（末块为密钥/存取控制块，不回读） */
const DATA_BLOCKS = 3

/** 卡密钥归一化：缺省出厂白键；非法输入在进入原生调用前拒绝 */
function normalizeKey(raw?: string): Buffer {
  const key = (raw ?? DEFAULT_KEY).trim()
  if (!/^[0-9a-f]{12}$/i.test(key)) {
    throw idCardError('VALIDATION_FAILED', 'IC 卡密钥不合法（应为 12 位 hex）')
  }
  return Buffer.from(key, 'hex')
}

/** 扇区号归一化：0-15 之外在进入原生调用前拒绝 */
function normalizeSector(raw?: number): number {
  const sector = raw ?? 1
  if (!Number.isInteger(sector) || sector < 0 || sector > 15) {
    throw idCardError('VALIDATION_FAILED', '扇区号不合法（应为 0-15）')
  }
  return sector
}

/**
 * 德卡驱动 —— "一个厂商 = 一个驱动类"（实现 BrandDriver，只声明 IC 卡能力）。
 * 新增厂商 = drivers/ 加一个同类驱动 + dll-adapter 注册表加一行。
 */
export class DecardDriver implements BrandDriver {
  readonly brand = '德卡'
  readonly displayName = '德卡 IC 卡读卡器（USB）'
  /** DLL 相对宿主资源根的出厂位置 */
  readonly dllFile = 'devices/decard/dcrf32.dll'
  /** 1001-1016 = USB；1-16 = 串口（USB 路线波特率被忽略） */
  readonly port = 1001
  readonly baud = 115200

  private readonly dllPath: string
  private lib: KoffiLib | null = null
  private fns: Record<string, KoffiFn> = {}
  /** dc_init 返回的设备句柄（open/close 会话内有效） */
  private handle: unknown = null

  constructor(resourcesRoot: string) {
    this.dllPath = path.join(resourcesRoot, this.dllFile)
  }

  dllPresent(): boolean {
    return existsSync(this.dllPath)
  }

  /** 懒加载：首次真正用设备时才 require koffi + LoadLibrary（缺依赖不影响服务启动） */
  private ensureLoaded(): void {
    if (this.lib)
      return
    if (!existsSync(this.dllPath)) {
      throw idCardError('DEVICE_OFFLINE', `德卡 DLL 未就位: ${this.dllPath}`, { dllPath: this.dllPath })
    }
    this.lib = requireKoffi({ dllPath: this.dllPath }).load(this.dllPath)
    const f = this.lib.func.bind(this.lib)
    // 指针入参统一传 Node Buffer（与 huashi-driver 同风格），出参手工读字节
    this.fns = {
      dc_init: f('void *dc_init(uint port, uint baud)'),
      dc_exit: f('int dc_exit(void *icdev)'),
      dc_request: f('int dc_request(void *icdev, uchar mode, uint *tagType)'),
      dc_anticoll: f('int dc_anticoll(void *icdev, uchar bantisel, uchar *snr)'),
      dc_select: f('int dc_select(void *icdev, uchar *snr, uchar *size)'),
      dc_authentication_pass: f('int dc_authentication_pass(void *icdev, uchar mode, uchar sector, uchar *key)'),
      dc_read: f('int dc_read(void *icdev, uchar addr, uchar *data)'),
      dc_write: f('int dc_write(void *icdev, uchar addr, uchar *data)'),
      dc_beep: f('int dc_beep(void *icdev, uint msec)'),
    }
  }

  /** 打开连接（USB 端口 1001）。dcrf32 无 cwd 依赖（无 license/资源文件），无需 chdir */
  open(): void {
    this.ensureLoaded()
    this.handle = this.fns.dc_init(this.port, this.baud)
    if (!this.handle) {
      throw idCardError('DEVICE_OFFLINE', `打开德卡读卡器失败（端口 ${this.port}）`, { port: this.port })
    }
  }

  /** 完整读卡：寻卡 → 防碰撞 → 选卡 → 认证 → 读数据块 */
  readIcCard(req: IcCardReadRequest): IcCardData {
    this.ensureLoaded()
    if (!this.handle) {
      throw idCardError('DEVICE_OFFLINE', '读卡器未打开')
    }
    const sector = normalizeSector(req?.sector)
    const key = normalizeKey(req?.key)
    const mode = req?.keyType === 'B' ? 4 : 0
    const h = this.handle

    // 寻卡（1 = ISO14443A；若真机寻卡失败可试 0 = 全部卡型）
    const tagType = Buffer.alloc(4)
    let ret = this.fns.dc_request(h, 1, tagType)
    if (ret !== 0) {
      throw idCardError('READ_FAILED', '寻卡失败：请将 IC 卡放置在读卡区', { stage: 'request', ret })
    }
    // 防碰撞 → UID（经典 API 走单级级联，4 字节 UID）
    const snr = Buffer.alloc(4)
    ret = this.fns.dc_anticoll(h, 0, snr)
    if (ret !== 0) {
      throw idCardError('READ_FAILED', '防碰撞失败', { stage: 'anticoll', ret })
    }
    // 选卡（size 出参为容量代码，本流程不消费）
    ret = this.fns.dc_select(h, snr, Buffer.alloc(1))
    if (ret !== 0) {
      throw idCardError('READ_FAILED', '选卡失败', { stage: 'select', ret })
    }
    // 密钥认证
    ret = this.fns.dc_authentication_pass(h, mode, sector, key)
    if (ret !== 0) {
      throw idCardError('READ_FAILED', `扇区 ${sector} 密钥认证失败（密钥不匹配或扇区被锁定）`, { stage: 'authentication', sector, ret })
    }
    // 读数据块：存取控制位可能只放行部分块，可读则读，全部不可读才算失败
    const blocks: Record<number, string> = {}
    const base = sector * BLOCKS_PER_SECTOR
    for (let i = 0; i < DATA_BLOCKS; i++) {
      const buf = Buffer.alloc(16)
      ret = this.fns.dc_read(h, base + i, buf)
      if (ret === 0) {
        blocks[base + i] = buf.toString('hex').toUpperCase()
      }
    }
    if (Object.keys(blocks).length === 0) {
      throw idCardError('READ_FAILED', `扇区 ${sector} 数据块全部不可读（存取控制位限制）`, { stage: 'read', sector })
    }
    // 读卡成功蜂鸣提示（失败不响，结果由返回值与错误呈现）
    this.fns.dc_beep(h, 30)
    return {
      uid: snr.toString('hex').toUpperCase(),
      // dc_request 的 ATQA 出参低字节在前（LE）：M1 = 04 00 → 0x0004
      cardType: tagType.readUInt16LE(0).toString(16).padStart(4, '0').toUpperCase(),
      blocks,
    }
  }

  /** 写卡数据归一化：块地址与写入内容在进入原生调用前全部校验（危险块强制拒绝） */
  private normalizeWrite(req: IcCardWriteRequest): { block: number, data: Buffer, sector: number, key: Buffer, mode: number } {
    const block = req?.block
    if (!Number.isInteger(block) || block < 0 || block > 63) {
      throw idCardError('VALIDATION_FAILED', '块地址不合法（应为 0-63）')
    }
    // 危险块强制拒绝：每扇区末块 = 密钥/存取控制块（写坏即锁卡），0 扇区 0 块 = 厂商块（UID 区一次性）
    if (block % BLOCKS_PER_SECTOR === BLOCKS_PER_SECTOR - 1) {
      throw idCardError('VALIDATION_FAILED', `块 ${block} 是密钥控制块，禁止写入（写坏将导致扇区永久锁死）`)
    }
    if (block === 0) {
      throw idCardError('VALIDATION_FAILED', '块 0 是厂商块（UID 区），禁止写入')
    }
    const data = Buffer.from((req?.data ?? '').trim(), 'hex')
    if (!/^[0-9a-f]{32}$/i.test((req?.data ?? '').trim()) || data.length !== 16) {
      throw idCardError('VALIDATION_FAILED', '写入数据不合法（应为 32 位 hex = 16 字节）')
    }
    const sector = Math.floor(block / BLOCKS_PER_SECTOR)
    return { block, data, sector, key: normalizeKey(req?.key), mode: req?.keyType === 'B' ? 4 : 0 }
  }

  /** 完整写卡：寻卡 → 防碰撞 → 选卡 → 认证 → 写块 → 蜂鸣；写前不回读（业务自行先 readIcCard 比对） */
  writeIcCard(req: IcCardWriteRequest): void {
    this.ensureLoaded()
    if (!this.handle) {
      throw idCardError('DEVICE_OFFLINE', '读卡器未打开')
    }
    const { block, data, sector, key, mode } = this.normalizeWrite(req)
    const h = this.handle

    const tagType = Buffer.alloc(4)
    let ret = this.fns.dc_request(h, 1, tagType)
    if (ret !== 0) {
      throw idCardError('READ_FAILED', '寻卡失败：请将 IC 卡放置在读卡区', { stage: 'request', ret })
    }
    const snr = Buffer.alloc(4)
    ret = this.fns.dc_anticoll(h, 0, snr)
    if (ret !== 0) {
      throw idCardError('READ_FAILED', '防碰撞失败', { stage: 'anticoll', ret })
    }
    ret = this.fns.dc_select(h, snr, Buffer.alloc(1))
    if (ret !== 0) {
      throw idCardError('READ_FAILED', '选卡失败', { stage: 'select', ret })
    }
    ret = this.fns.dc_authentication_pass(h, mode, sector, key)
    if (ret !== 0) {
      throw idCardError('READ_FAILED', `扇区 ${sector} 密钥认证失败（密钥不匹配或扇区被锁定）`, { stage: 'authentication', sector, ret })
    }
    ret = this.fns.dc_write(h, block, data)
    if (ret !== 0) {
      throw idCardError('WRITE_FAILED', `块 ${block} 写入失败（存取控制位可能禁止写）`, { stage: 'write', block, ret })
    }
    this.fns.dc_beep(h, 60)
  }

  close(): void {
    try {
      if (this.handle) {
        this.fns?.dc_exit(this.handle)
      }
    }
    catch {
      /* 关闭失败静默：设备状态由下次 open 重建 */
    }
    this.handle = null
  }
}
