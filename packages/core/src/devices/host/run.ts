import type { BrandDriver, IcCardData, IcCardReadRequest, IcCardWriteRequest, IdCardData, IdReaderDevice } from '../idcard/types'
import type { HostError, HostRequest, HostResponse } from './protocol'
import process from 'node:process'
import { DecardDriver } from '../idcard/drivers/decard-driver'
import { HuashiDriver } from '../idcard/drivers/huashi-driver'
import { KemiDriver } from '../idcard/drivers/kemi-driver'
import { koffiAvailable } from '../idcard/drivers/koffi'
import { idCardError } from '../idcard/errors'
import { queryWinspoolForms, queryWinspoolHardware } from '../print/winspool-forms'

/**
 * 设备守护进程入口运行器（utilityProcess 子进程内执行）：
 * 厂商 DLL 的 koffi 调用全部收敛在本进程——native 崩溃（踩内存/非法访问）只炸守护进程，
 * 主进程与渲染进程不受影响，由 DeviceHost 退避重启自愈。
 *
 * 厂商接入方式（与主进程侧解耦）：
 * 1. drivers/ 加一个 BrandDriver 驱动类（纯 koffi 调用，同华视/德卡）
 * 2. DRIVERS 注册表加一行
 * 3. 新方法在此补 dispatch 分支（或复用 read/readIc/writeIc 通用会话）
 */
const DRIVERS: Record<string, new (resourcesRoot: string) => BrandDriver> = {
  huashi: HuashiDriver,
  kemi: KemiDriver,
  decard: DecardDriver,
}

/** 崩溃注入环境变量（联调开关）：由 DeviceHost 决定传给哪个进程实例 */
export const DEVICE_HOST_CRASH_ENV = 'DESKTOP_DEVICE_HOST_CRASH'

/** 请求载荷公共段：资源根（DLL 寻址基准）+ 驱动名（设备 id "dll:<name>" 的约定后段） */
interface DriverPayload {
  resourcesRoot: string
  driverName: string
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

/** idcard.listReaders：koffi 可用性 + DLL 就位探测在守护进程内完成（主进程零 native 依赖） */
function listIdReaders(resourcesRoot: string): IdReaderDevice[] {
  const koffi = koffiAvailable()
  return Object.entries(DRIVERS).map(([name, Ctor]) => {
    const driver = new Ctor(resourcesRoot)
    const dllPresent = driver.dllPresent()
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
    const meta: Record<string, unknown> = { driver: name, dllFile: driver.dllFile, note }
    if (driver.lockGroup) {
      meta.lockGroup = driver.lockGroup
    }
    return {
      id: `dll:${name}`,
      displayName: driver.displayName,
      brand: driver.brand,
      transport: 'dll' as const,
      status,
      capabilities: capabilitiesOf(driver),
      meta,
    }
  })
}

/**
 * 驱动会话：定位驱动 → koffi/DLL 前置校验 → 能力校验 → open → 执行 → close（成对必达）。
 * capability 先校验再 open：无该能力的驱动不白开一次设备。
 */
function withSession<T>(
  payload: DriverPayload,
  capability: 'readCard' | 'readIcCard' | 'writeIcCard',
  run: (driver: BrandDriver) => T,
): T {
  const Ctor = DRIVERS[payload.driverName]
  if (!Ctor) {
    throw idCardError('ADAPTER_UNAVAILABLE', `未实现品牌驱动: ${payload.driverName}`, { brand: payload.driverName })
  }
  if (!koffiAvailable()) {
    throw idCardError('ADAPTER_UNAVAILABLE', '未安装 koffi 依赖（npm i koffi）')
  }
  const driver = new Ctor(payload.resourcesRoot)
  if (!driver[capability]) {
    throw idCardError('ADAPTER_UNAVAILABLE', `驱动 ${payload.driverName} 不支持该读卡能力（capabilities 以 listReaders 为准）`)
  }
  if (!driver.dllPresent()) {
    throw idCardError('DEVICE_OFFLINE', `DLL 未就位: ${driver.dllFile}`)
  }
  driver.open()
  try {
    return run(driver)
  }
  finally {
    driver.close()
  }
}

/** 请求分发：方法表驱动的设备无关 RPC；未知方法显式报错（主进程侧契约与实现不同步时暴露） */
function dispatch(method: string, payload: unknown): unknown {
  switch (method) {
    case 'idcard.listReaders': {
      const { resourcesRoot } = payload as { resourcesRoot: string }
      return listIdReaders(resourcesRoot)
    }
    case 'idcard.read': {
      const p = payload as DriverPayload
      return withSession(p, 'readCard', driver => driver.readCard!()) satisfies IdCardData
    }
    case 'idcard.readIc': {
      const p = payload as DriverPayload & { req: IcCardReadRequest }
      return withSession(p, 'readIcCard', driver => driver.readIcCard!(p.req)) satisfies IcCardData
    }
    case 'idcard.writeIc': {
      const p = payload as DriverPayload & { req: IcCardWriteRequest }
      withSession(p, 'writeIcCard', (driver) => {
        driver.writeIcCard!(p.req)
        return true
      })
      return undefined
    }
    // 打印 winspool 探测（koffi 同步调用）：收敛进守护进程，主进程事件循环零阻塞。
    // 两个查询内部自带平台 + koffi 可用性守卫（非 win32 / 缺依赖返回 null），无需重复判断。
    case 'print.winspoolForms': {
      const { printerName } = payload as { printerName: string }
      return queryWinspoolForms(printerName)
    }
    case 'print.winspoolHardware': {
      const { printerName } = payload as { printerName: string }
      return queryWinspoolHardware(printerName)
    }
    default:
      throw idCardError('ADAPTER_UNAVAILABLE', `守护进程未实现方法: ${method}`)
  }
}

/** 错误归一为跨进程载荷（IdCardError 取 code/detail，其余按 UNKNOWN） */
function toHostError(err: unknown): HostError {
  const carrier = err as { name?: unknown, code?: unknown, detail?: unknown } | null
  return {
    name: err instanceof Error ? err.name : typeof err,
    code: typeof carrier?.code === 'string' ? carrier.code : 'UNKNOWN',
    message: err instanceof Error ? err.message : String(err),
    detail: carrier?.detail,
  }
}

/**
 * 启动守护进程消息循环。崩溃注入（DEVICE_HOST_CRASH=1，由 DeviceHost 首次 spawn 时传入）：
 * 首个请求正常响应后立即 process.crash() 真崩溃——验证 pending 拒绝、退避重启与自愈闭环。
 */
export function runDeviceHost(): void {
  const injectCrash = process.env[DEVICE_HOST_CRASH_ENV] === '1'
  process.parentPort.on('message', (event) => {
    const req = event.data as HostRequest
    let response: HostResponse
    try {
      response = { id: req.id, result: dispatch(req.method, req.payload) }
    }
    catch (err) {
      response = { id: req.id, error: toHostError(err) }
    }
    process.parentPort.postMessage(response)
    if (injectCrash) {
      setImmediate(() => process.crash())
    }
  })
}
