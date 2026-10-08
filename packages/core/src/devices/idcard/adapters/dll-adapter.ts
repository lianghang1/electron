import type { BrandDriver, IdCardAdapter, IdCardData, IdReaderDevice, IdReaderResult } from '../types'
import { createRequire } from 'node:module'
import { HuashiDriver } from '../drivers/huashi-driver'
import { toIdCardError } from '../errors'

const nodeRequire = createRequire(__filename)

/**
 * DLL 路线适配器（华视/哲林等 C 接口 SDK）。
 * 两层结构：本适配器只做【路由 + 生命周期 + 错误统一】；厂商差异在 drivers/ 品牌驱动类里
 * （身份/DLL 位置/端口/行为内聚于类，实现 BrandDriver，见 types.ts）。
 * 新厂商 = drivers/ 加一个驱动类 + 注册表加一行。
 */

/** 注册表：驱动名 → 构造函数（资源根由适配器注入） */
const DRIVERS: Record<string, (resourcesRoot: string) => BrandDriver> = {
  huashi: resourcesRoot => new HuashiDriver(resourcesRoot),
}

function koffiAvailable(): boolean {
  try {
    nodeRequire.resolve('koffi')
    return true
  }
  catch {
    return false
  }
}

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
      return {
        id: `${this.transport}:${name}`,
        displayName: driver.displayName,
        brand: driver.brand,
        transport: this.transport,
        status,
        meta: { driver: name, dllFile: driver.dllFile, note },
      }
    })
  }

  async read(device: IdReaderDevice): Promise<IdReaderResult> {
    try {
      // 设备 ID 约定（全系统同构）：<transport>:<名字>
      const driverName = device.id.slice(this.transport.length + 1)
      const create = DRIVERS[driverName]
      if (!create) {
        return {
          ok: false,
          error: { code: 'ADAPTER_UNAVAILABLE', message: `未实现品牌驱动: ${driverName}`, detail: { brand: driverName } },
        }
      }
      if (!koffiAvailable()) {
        return { ok: false, error: { code: 'ADAPTER_UNAVAILABLE', message: '未安装 koffi 依赖（npm i koffi）' } }
      }
      const driver = create(this.resourcesRoot)
      if (!driver.dllPresent()) {
        return { ok: false, error: { code: 'DEVICE_OFFLINE', message: `DLL 未就位: ${driver.dllFile}` } }
      }
      driver.open()
      try {
        const data: IdCardData = driver.readCard()
        return { ok: true, data, meta: { brand: driver.brand, transport: 'dll', driver: driverName } }
      }
      finally {
        driver.close()
      }
    }
    catch (err) {
      const ce = toIdCardError(err)
      return { ok: false, error: { code: ce.code as never, message: ce.message, detail: ce.detail } }
    }
  }
}
