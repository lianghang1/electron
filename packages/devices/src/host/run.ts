import type { CaptureDevice, CaptureDeviceConfig } from '@shell/shared'
import type { IcCardData, IcCardDriver, IcCardReadRequest, IcCardWriteRequest } from '../domains/iccard/device-contracts'
import type { IdCardData, IdCardDriver, IdReaderDevice } from '../domains/idcard/device-contracts'
import type { HostError, HostRequest, HostResponse } from './protocol'
import { existsSync, readdirSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import process from 'node:process'
import { icCardError } from '../domains/iccard/errors'
import { DecardDriver } from '../domains/iccard/vendors/decard-driver'
import { idCardError } from '../domains/idcard/errors'
import { HuashiDriver } from '../domains/idcard/vendors/huashi-driver'
import { KemiDriver } from '../domains/idcard/vendors/kemi-driver'
import { detectDevicePlatform } from '../domains/platform'
import { queryWinspoolForms, queryWinspoolHardware } from '../domains/print/winspool-forms'
import { koffiAvailable } from '../kernel/koffi'

/**
 * 设备守护进程入口运行器（utilityProcess 子进程内执行）：
 * 厂商 DLL 的 koffi 调用全部收敛在本进程——native 崩溃（踩内存/非法访问）只炸守护进程，
 * 主进程与渲染进程不受影响，由 DeviceHost 退避重启自愈。
 *
 * 域接入方式（域方法表注册制，主进程侧经 DeviceHost.request 调用）：
 * 1. 纯配置/探测类方法：注册表里直接写 handler（见 print 域）
 * 2. 厂商 DLL 类方法：vendors/ 加一个驱动类（纯 koffi 调用，同华视/德卡），
 *    对应域驱动注册表加一行，域方法经会话走"定位驱动 → 前置校验 → open → 执行 → close"通用会话
 */

/** 域方法表：method 名 = "<域>.<动作>"（如 idcard.read）；域接入守护进程 = 注册一处 */
type HostMethodHandler = (payload: unknown) => unknown
const DOMAIN_METHODS = new Map<string, Map<string, HostMethodHandler>>()

export function registerDomainMethods(domain: string, methods: Record<string, HostMethodHandler>): void {
  const table = DOMAIN_METHODS.get(domain) ?? new Map<string, HostMethodHandler>()
  for (const [method, handler] of Object.entries(methods)) {
    table.set(method, handler)
  }
  DOMAIN_METHODS.set(domain, table)
}

// ── idcard（身份证）/ iccard（M1 IC 卡）域：厂商驱动注册表与会话 ──
// 两域一设备一域拆分：华视/科密 = 身份证阅读器（idcard），德卡 = M1 IC 卡读写（iccard）。

/** idcard 域厂商驱动注册表（键 = 设备 id "dll:<name>" 后段；资源对账枚举驱动 dllFile 用） */
export const ID_DRIVERS: Record<string, new (resourcesRoot: string) => IdCardDriver> = {
  huashi: HuashiDriver,
  kemi: KemiDriver,
}

/** iccard 域厂商驱动注册表（同上） */
export const IC_DRIVERS: Record<string, new (resourcesRoot: string) => IcCardDriver> = {
  decard: DecardDriver,
}

/** 请求载荷公共段：资源根（DLL 寻址基准）+ 驱动名（设备 id "dll:<name>" 的约定后段） */
interface DriverPayload {
  resourcesRoot: string
  driverName: string
}

/** 守护进程内结构化错误构造（两域同签名）：host 协议仅按 code/detail 透传，类名不承载域语义 */
type CardErrorFactory = typeof idCardError | typeof icCardError

/**
 * 原生 DLL 对接面统一守卫（idcard/iccard/capture 探测共用）：平台不支持或 koffi 缺失 → 不可用，
 * 设备状态 unavailable（note 说明原因）而非报错。
 */
function nativeAvailability(): { usable: boolean, note: string } {
  const platform = detectDevicePlatform()
  if (!platform.nativeSupported) {
    return { usable: false, note: `当前平台（${platform.id}）暂不支持原生 DLL 对接` }
  }
  if (!koffiAvailable()) {
    return { usable: false, note: '需安装 koffi 依赖（npm i koffi）' }
  }
  return { usable: true, note: '就绪' }
}

/**
 * 读卡器驱动会话定位：驱动查找 → koffi/DLL 前置校验（先校验再 open，无该能力的驱动不白开一次设备）。
 * capability 校验由各域会话按自身驱动契约执行（idcard 域 readCard 必选免校验）。
 */
function locateCardDriver<D extends { dllFile: string, dllPresent: () => boolean }>(
  payload: DriverPayload,
  drivers: Record<string, new (resourcesRoot: string) => D>,
  errorOf: CardErrorFactory,
): D {
  if (!koffiAvailable()) {
    throw errorOf('CHANNEL_UNAVAILABLE', '未安装 koffi 依赖（npm i koffi）')
  }
  const Ctor = drivers[payload.driverName]
  if (!Ctor) {
    throw errorOf('CHANNEL_UNAVAILABLE', `未实现品牌驱动: ${payload.driverName}`, { brand: payload.driverName })
  }
  const driver = new Ctor(payload.resourcesRoot)
  if (!driver.dllPresent()) {
    throw errorOf('DEVICE_OFFLINE', `DLL 未就位: ${driver.dllFile}`)
  }
  return driver
}

/** 驱动会话：定位驱动 → 前置校验 → open → 执行 → close（成对必达） */
function withCardSession<D extends { open: () => void, close: () => void }, R>(
  driver: D,
  run: (driver: D) => R,
): R {
  driver.open()
  try {
    return run(driver)
  }
  finally {
    driver.close()
  }
}

/**
 * offline note 增强：资源目录下存在「厂商名前缀」的相近目录时提示疑似打错
 * （如声明 devices/idcard/huashi/... 但发现 idcard/huashi1/ ——装机排查从盲猜变直接指路）。
 * 厂商段取平台段前一段（print 无厂商层时恰为域名，平台目录不会命中前缀）。
 */
function typoHintOf(resourcesRoot: string, dllFile: string): string {
  const segments = dllFile.split('/')
  const vendor = segments[segments.length - 2]
  if (!vendor || segments.length < 4) {
    return ''
  }
  const domainDir = join(resourcesRoot, 'devices', segments[1])
  if (!existsSync(domainDir)) {
    return ''
  }
  let entries: string[]
  try {
    entries = readdirSync(domainDir, { withFileTypes: true }).map(entry => entry.name)
  }
  catch {
    return ''
  }
  const suspect = entries.find(name => name !== vendor && name.startsWith(vendor))
  return suspect ? `；疑似目录名打错: ${segments[1]}/${suspect}/` : ''
}

/**
 * 读卡器枚举（idcard/iccard 域共用形状）：平台/koffi/DLL 就位探测在守护进程内完成
 * （主进程零 native 依赖）。能力标签由 capabilitiesOf 按域语义生成。
 */
function listCardReaders<D extends IdCardDriver | IcCardDriver>(
  resourcesRoot: string,
  drivers: Record<string, new (resourcesRoot: string) => D>,
  capabilitiesOf: (driver: D) => string[],
): IdReaderDevice[] {
  const native = nativeAvailability()
  return Object.entries(drivers).map(([name, Ctor]) => {
    const driver = new Ctor(resourcesRoot)
    const dllPresent = driver.dllPresent()
    let status: IdReaderDevice['status']
    let note: string
    if (!native.usable) {
      status = 'unavailable'
      note = native.note
    }
    else if (dllPresent) {
      status = 'ready'
      note = '就绪'
    }
    else {
      status = 'offline'
      note = `DLL 未就位（放置 SDK 目录后刷新）${typoHintOf(resourcesRoot, driver.dllFile)}`
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

registerDomainMethods('idcard', {
  'idcard.listReaders': (payload) => {
    const { resourcesRoot } = payload as { resourcesRoot: string }
    return listCardReaders(resourcesRoot, ID_DRIVERS, () => ['idcard'])
  },
  'idcard.read': (payload) => {
    const p = payload as DriverPayload
    const driver = locateCardDriver(p, ID_DRIVERS, idCardError)
    return withCardSession(driver, d => d.readCard()) satisfies IdCardData
  },
})

registerDomainMethods('iccard', {
  'iccard.listReaders': (payload) => {
    const { resourcesRoot } = payload as { resourcesRoot: string }
    return listCardReaders(resourcesRoot, IC_DRIVERS, driver =>
      (driver.writeIcCard ? ['iccard', 'iccard-write'] : ['iccard']))
  },
  'iccard.readIc': (payload) => {
    const p = payload as DriverPayload & { req: IcCardReadRequest }
    const driver = locateCardDriver(p, IC_DRIVERS, icCardError)
    return withCardSession(driver, d => d.readIcCard(p.req)) satisfies IcCardData
  },
  'iccard.writeIc': (payload) => {
    const p = payload as DriverPayload & { req: IcCardWriteRequest }
    const driver = locateCardDriver(p, IC_DRIVERS, icCardError)
    // 写卡为可选能力：先校验再 open（无该能力的驱动不白开一次设备）
    if (!driver.writeIcCard) {
      throw icCardError('CHANNEL_UNAVAILABLE', `驱动 ${p.driverName} 不支持 IC 卡写入（capabilities 以 listReaders 为准）`)
    }
    withCardSession(driver, (d) => {
      d.writeIcCard!(p.req)
      return true
    })
    return undefined
  },
})

// ── print 域：winspool 探测（koffi 同步调用收敛进守护进程，主进程事件循环零阻塞） ──
// 两个查询内部自带平台 + koffi 可用性守卫（非 win32 / 缺依赖返回 null），无需重复判断。

registerDomainMethods('print', {
  'print.winspoolForms': (payload) => {
    const { printerName } = payload as { printerName: string }
    return queryWinspoolForms(printerName)
  },
  'print.winspoolHardware': (payload) => {
    const { printerName } = payload as { printerName: string }
    return queryWinspoolHardware(printerName)
  },
})

// ── capture 域：DLL 路线探测（koffi 可用性 + DLL 就位收敛进守护进程，主进程零 native 依赖） ──

/** dll-channel 发送的档案载荷：dll 段由 core 内部 DLL 注册表回填（档案本体不含，守护进程只认该形状） */
type DaemonCaptureProfile = CaptureDeviceConfig & { dll?: { file: string, functions?: Record<string, string> } }

/** DLL 域配置探测：平台不支持/koffi 缺失 → unavailable；DLL 缺席 → offline；就位 → ready（待厂商档案后真正可用） */
function listCaptureDevices(resourcesRoot: string, profiles: DaemonCaptureProfile[]): CaptureDevice[] {
  const native = nativeAvailability()
  return profiles.flatMap((p) => {
    const dll = p.dll
    if (!dll) {
      return []
    }
    const dllPath = isAbsolute(dll.file) ? dll.file : join(resourcesRoot, dll.file)
    let status: CaptureDevice['status']
    let note: string
    if (!native.usable) {
      status = 'unavailable'
      note = native.note
    }
    else if (existsSync(dllPath)) {
      status = 'ready'
      note = '待填厂商函数签名后可用'
    }
    else {
      status = 'offline'
      note = `DLL 未就位（放置 SDK 目录后刷新）${typoHintOf(resourcesRoot, dll.file)}`
    }
    return [{
      id: `dll:${p.id}`,
      displayName: p.displayName,
      brand: p.brand,
      transport: 'dll' as const,
      status,
      capabilities: { crop: true, desewarp: true, dualPage: true, ocr: true, ...(p.capabilities ?? {}) },
      meta: {
        dllFile: dll.file,
        functions: Object.keys(dll.functions ?? {}),
        note,
      },
    }]
  })
}

registerDomainMethods('capture', {
  'capture.listDevices': (payload) => {
    const { resourcesRoot, profiles } = payload as { resourcesRoot: string, profiles: DaemonCaptureProfile[] }
    return listCaptureDevices(resourcesRoot, profiles)
  },
})

/** 请求分发：域方法表查找；未知方法显式报错（主进程侧契约与实现不同步时暴露） */
function dispatch(method: string, payload: unknown): unknown {
  const dot = method.indexOf('.')
  const handler = dot > 0 ? DOMAIN_METHODS.get(method.slice(0, dot))?.get(method) : undefined
  if (!handler) {
    throw idCardError('CHANNEL_UNAVAILABLE', `守护进程未实现方法: ${method}`)
  }
  return handler(payload)
}

/** 错误归一为跨进程载荷（结构化错误取 code/detail，其余按 UNKNOWN） */
function toHostError(err: unknown): HostError {
  const carrier = err as { name?: unknown, code?: unknown, detail?: unknown } | null
  return {
    name: err instanceof Error ? err.name : typeof err,
    code: typeof carrier?.code === 'string' ? carrier.code : 'UNKNOWN',
    message: err instanceof Error ? err.message : String(err),
    detail: carrier?.detail,
  }
}

/** 启动守护进程消息循环，按 requestId 配对请求与响应。 */
export function runDeviceHost(): void {
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
  })
}
