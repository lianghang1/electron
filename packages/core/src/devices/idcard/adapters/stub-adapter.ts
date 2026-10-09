import type { IcCardReadRequest, IcCardWriteRequest, IcCardWriteResult, IcReaderResult, IdCardAdapter, IdCardData, IdReaderDevice, IdReaderResult } from '../types'
import { Buffer } from 'node:buffer'

/** 占位证件照：生成 80×100 单色调 BMP dataURL（mock 用，避免依赖 capture 模块） */
function placeholderPhoto(): string {
  const w = 80
  const h = 100
  const rowSize = Math.ceil((w * 3) / 4) * 4
  const pixels = Buffer.alloc(rowSize * h, 0)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const off = (h - 1 - y) * rowSize + x * 3
      const face = x > 20 && x < 60 && y > 15 && y < 55
      const body = y >= 60 && y < h
      pixels[off] = face || body ? 0xB0 : 0xE8
      pixels[off + 1] = face || body ? 0xBC : 0xEA
      pixels[off + 2] = face || body ? 0xD0 : 0xEE
    }
  }
  const header = Buffer.alloc(54)
  header.write('BM', 0)
  header.writeUInt32LE(54 + pixels.length, 2)
  header.writeUInt32LE(54, 10)
  header.writeUInt32LE(40, 14)
  header.writeInt32LE(w, 18)
  header.writeInt32LE(h, 22)
  header.writeUInt16LE(1, 26)
  header.writeUInt16LE(24, 28)
  header.writeUInt32LE(pixels.length, 34)
  return `data:image/bmp;base64,${Buffer.concat([header, pixels]).toString('base64')}`
}

/** mock 读卡器：无硬件验证全链路。数据为明显虚构值；照片为占位图 */
export class StubIdAdapter implements IdCardAdapter {
  readonly transport = 'stub' as const

  async listReaders(): Promise<IdReaderDevice[]> {
    return [
      {
        id: 'stub:reader',
        displayName: '模拟证卡读卡器（stub）',
        brand: '内置',
        transport: 'stub',
        status: 'ready',
        capabilities: ['idcard', 'iccard', 'iccard-write'],
        meta: { note: '返回虚构身份信息（张三/测试），用于无硬件验证 读取→展示 链路' },
      },
    ]
  }

  async read(_device: IdReaderDevice): Promise<IdReaderResult> {
    const data: IdCardData = {
      name: '张三（模拟）',
      idNumber: '110101199001011234',
      gender: '男',
      nation: '汉',
      birthDate: '1990-01-01',
      address: '北京市东城区模拟路 1 号（模拟数据）',
      issuer: '模拟公安局东城分局',
      validFrom: '2020-01-01',
      validTo: '2040-01-01',
      photoDataUrl: placeholderPhoto(),
    }
    return { ok: true, data, meta: { transport: 'stub', simulated: true } }
  }

  /** mock IC 卡：UID 固定 + 每字节 = 块地址的规律填充，扇区/块映射一眼可辨 */
  async readIc(_device: IdReaderDevice, req: IcCardReadRequest): Promise<IcReaderResult> {
    const sector = req?.sector ?? 1
    const blocks: Record<number, string> = {}
    for (let i = 0; i < 3; i++) {
      const addr = sector * 4 + i
      blocks[addr] = Buffer.alloc(16, addr).toString('hex').toUpperCase()
    }
    const data = { uid: '04A3B2C1', cardType: '0004', blocks }
    return { ok: true, data, meta: { transport: 'stub', simulated: true } }
  }

  /** mock 写卡：危险块校验与真机同规则（控制块/厂商块拒绝），合法块写入后回读可见 */
  async writeIc(_device: IdReaderDevice, req: IcCardWriteRequest): Promise<IcCardWriteResult> {
    const block = req?.block
    if (!Number.isInteger(block) || block < 0 || block > 63) {
      return { ok: false, error: { code: 'VALIDATION_FAILED', message: '块地址不合法（应为 0-63）' } }
    }
    if (block % 4 === 3 || block === 0) {
      return { ok: false, error: { code: 'VALIDATION_FAILED', message: `块 ${block} 为${block === 0 ? '厂商块' : '密钥控制块'}，禁止写入` } }
    }
    if (!/^[0-9a-fA-F]{32}$/.test((req?.data ?? '').trim())) {
      return { ok: false, error: { code: 'VALIDATION_FAILED', message: '写入数据不合法（应为 32 位 hex = 16 字节）' } }
    }
    return { ok: true, meta: { transport: 'stub', simulated: true, block } }
  }
}
