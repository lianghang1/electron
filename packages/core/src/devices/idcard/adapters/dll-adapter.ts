import type { BrandDriver, IcCardReadRequest, IcCardWriteRequest, IcCardWriteResult, IcReaderResult, IdCardAdapter, IdCardData, IdReaderDevice, IdReaderResult } from '../types'
import { DecardDriver } from '../drivers/decard-driver'
import { HuashiDriver } from '../drivers/huashi-driver'
import { KemiDriver } from '../drivers/kemi-driver'
import { koffiAvailable } from '../drivers/koffi'
import { toIdCardError } from '../errors'

/**
 * DLL 路线适配器（华视/德卡/科密等 C 接口 SDK）。
 * 两层结构：本适配器只做【路由 + 生命周期 + 错误统一】；厂商差异在 drivers/ 品牌驱动类里
 * （身份/DLL 位置/端口/能力内聚于类，实现 BrandDriver，见 types.ts）。
 * 新厂商 = drivers/ 加一个驱动类 + 注册表加一行。
 */

/** 注册表：驱动名 → 构造函数（资源根由适配器注入） */
const DRIVERS: Record<string, (resourcesRoot: string) => BrandDriver> = {
  huashi: resourcesRoot => new HuashiDriver(resourcesRoot),
  kemi: resourcesRoot => new KemiDriver(resourcesRoot),
  decard: resourcesRoot => new DecardDriver(resourcesRoot),
}

/** 能力标签由驱动已实现的方法自动生成：'idcard' = 身份证，'iccard' = M1 读，'iccard-write' = M1 写 */
function capabilitiesOf(driver: BrandDriver): string[] {
  const caps: string[] = []
  if (driver.readCard) {
    caps.push('idcard')
  }
  if (driver.readIcCard) {
    caps.push('iccard')
  }
  if (driver.writeIcCard) {
    caps.push('iccard-write')
  }
  return caps
}

/** 读卡会话结果（错误形状与 IdReaderResult/IcReaderResult 的 error 同构） */
type SessionOutcome<T> = { ok: true, data: T, meta: Record<string, unknown> } | { ok: false, error: NonNullable<IdReaderResult['error']> }

export class DllIdAdapter implements IdCardAdapter {
  readonly transport = 'dll' as const

  constructor(private readonly resourcesRoot: string) {}

  async listReaders(): Promise<IdReaderDevice[]> {
    // koffi 是否可用是进程级常量，列出设备前判一次即可
    const koffi = koffiAvailable()
    return Object.entries(DRIVERS).map(([name, create]) => {
      const driver = create(this.resourcesRoot)
      const dllPresent = driver.dllPresent()
      // 状态与提示成对产出，避免两处分支各自演化
      let status: IdReaderDevice['status']
      let note: string
      if (!koffi) {
        status = 'unavailable'
        note = '需安装 koffi 依赖（npm i koffi）'
      }
      else if (dllPresent) {
        status = 'ready'
        note = '就绪'
      }
      else {
        status = 'offline'
        note = 'DLL 未就位（放置 SDK 目录后刷新）'
      }
      // lockGroup 仅在驱动声明时透传：service 据此合并设备锁（未声明则缺省，锁按设备 ID）
      const meta: Record<string, unknown> = { driver: name, dllFile: driver.dllFile, note }
      if (driver.lockGroup) {
        meta.lockGroup = driver.lockGroup
      }
      return {
        id: `${this.transport}:${name}`,
        displayName: driver.displayName,
        brand: driver.brand,
        transport: this.transport,
        status,
        capabilities: capabilitiesOf(driver),
        meta,
      }
    })
  }

  async read(device: IdReaderDevice): Promise<IdReaderResult> {
    try {
      const session = await this.withSession(device, 'readCard', driver => driver.readCard!())
      return session.ok ? { ok: true, data: session.data, meta: session.meta } : { ok: false, error: session.error }
    }
    catch (err) {
      return this.toFailure(err)
    }
  }

  async readIc(device: IdReaderDevice, req: IcCardReadRequest): Promise<IcReaderResult> {
    try {
      const session = await this.withSession(device, 'readIcCard', driver => driver.readIcCard!(req))
      return session.ok ? { ok: true, data: session.data, meta: session.meta } : { ok: false, error: session.error }
    }
    catch (err) {
      return this.toFailure(err)
    }
  }

  async writeIc(device: IdReaderDevice, req: IcCardWriteRequest): Promise<IcCardWriteResult> {
    try {
      const session = await this.withSession(device, 'writeIcCard', (driver) => {
        driver.writeIcCard!(req)
        return true
      })
      return session.ok ? { ok: true, meta: session.meta } : { ok: false, error: session.error }
    }
    catch (err) {
      return this.toFailure(err)
    }
  }

  /**
   * 驱动会话：定位驱动 → koffi/DLL 前置校验 → 能力校验 → open → 执行 → close（成对必达）。
   * capability 先校验再 open：无该能力的驱动不白开一次设备。
   */
  private async withSession<T>(
    device: IdReaderDevice,
    capability: 'readCard' | 'readIcCard' | 'writeIcCard',
    run: (driver: BrandDriver) => T,
  ): Promise<SessionOutcome<T>> {
    // 设备 ID 约定（全系统同构）：<transport>:<名字>
    const driverName = device.id.slice(this.transport.length + 1)
    const create = DRIVERS[driverName]
    if (!create) {
      return { ok: false, error: { code: 'ADAPTER_UNAVAILABLE', message: `未实现品牌驱动: ${driverName}`, detail: { brand: driverName } } }
    }
    if (!koffiAvailable()) {
      return { ok: false, error: { code: 'ADAPTER_UNAVAILABLE', message: '未安装 koffi 依赖（npm i koffi）' } }
    }
    const driver = create(this.resourcesRoot)
    if (!driver[capability]) {
      return { ok: false, error: { code: 'ADAPTER_UNAVAILABLE', message: `驱动 ${driverName} 不支持该读卡能力（capabilities 以 listReaders 为准）` } }
    }
    if (!driver.dllPresent()) {
      return { ok: false, error: { code: 'DEVICE_OFFLINE', message: `DLL 未就位: ${driver.dllFile}` } }
    }
    driver.open()
    try {
      return { ok: true, data: run(driver), meta: { brand: driver.brand, transport: 'dll', driver: driverName } }
    }
    finally {
      driver.close()
    }
  }

  /** 失败结果（无 data，两种读卡返回类型通用） */
  private toFailure(err: unknown): { ok: false, error: NonNullable<IdReaderResult['error']> } {
    const ce = toIdCardError(err)
    return { ok: false, error: { code: ce.code, message: ce.message, detail: ce.detail } }
  }
}
