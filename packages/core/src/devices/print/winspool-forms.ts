import type { PrinterDefaults, PrinterPaper } from '@desktop/shared'
import type { KoffiModule } from '../idcard/drivers/koffi'
import { Buffer } from 'node:buffer'
import process from 'node:process'
import { koffiAvailable, requireKoffi } from '../idcard/drivers/koffi'

/**
 * winspool.drv 直调：读取打印机驱动注册的纸张表单（名字 + 物理尺寸）与打印默认值（DEVMODE）。
 * WMI 的 Win32_Printer.PrinterPaperNames 走代理层，对 v4 class driver / 热敏/针打驱动普遍残缺，
 * DeviceCapabilitiesW 是驱动能力查询的权威 API（各类打印软件的同款数据源）。
 * 部分驱动（如实达/DASCOM 针打）不支持 DC_PAPERSIZE，尺寸退化从 GetFormW 表单库 / 表单名解析。
 * DEVMODE 默认值经 pDevMode 指针换算偏移后按实测布局手工解析（koffi 结构体解码在本环境
 * 返回空对象不可用），字段偏移以真机 dmSize=220 实测为准（打印参数区扁平排列，无 union 填充）。
 * koffi 缺失或调用链任一步失败时返回 null / 能力位保留，由上层按无数据处理。
 */

// wingdi.h DeviceCapabilities 能力常量
const DC_PAPERSIZE = 3
const DC_DUPLEX = 7
const DC_PAPERNAMES = 16
const DC_COLORDEVICE = 32
/** 驱动表单名上限（wchar_t 个数），GDI 约定 64 字符 */
const FORM_NAME_CHARS = 64
/** FORM_INFO_1W 的 x64 内存大小：Flags(4) + pad(4) + pName(8) + Size(8) + ImageableArea(16) */
const FORM_INFO_1_SIZE = 40

// DEVMODE.dmFields 字段有效位（wingdi.h）
const DM_ORIENTATION = 0x1
const DM_COPIES = 0x100
const DM_COLOR = 0x800
const DM_DUPLEX = 0x1000
const DM_FORMNAME = 0x10000

/** DEVMODEW 关键字段偏移（x64 实测 dmSize=220，打印参数区扁平排列） */
const DM_OFFSET_FIELDS = 72
const DM_OFFSET_ORIENTATION = 76
const DM_OFFSET_COPIES = 86
const DM_OFFSET_COLOR = 92
const DM_OFFSET_DUPLEX = 94
const DM_OFFSET_FORMNAME = 102
/** dmFormName wchar 个数，GDI 约定 32 字符 */
const DEVMODE_FORMNAME_CHARS = 32
/** 默认值读取覆盖到 dmFormName 区尾的最小结构尺寸 */
const DEVMODE_MIN_SIZE = DM_OFFSET_FORMNAME + DEVMODE_FORMNAME_CHARS * 2

/** 原生函数返回类型由签名字符串约定，这里显式落型避免 unknown 扩散 */
type BoolFn = (...args: unknown[]) => boolean
type CountFn = (...args: unknown[]) => number

function declareFns(koffi: KoffiModule): { open: BoolFn, close: BoolFn, getInfo: BoolFn, caps: CountFn, getForm: BoolFn } {
  const lib = koffi.load('winspool.drv')
  return {
    open: lib.func('bool OpenPrinterW(const wchar_t *name, uint64_t *handle, void *pDefault)') as BoolFn,
    close: lib.func('bool ClosePrinter(uint64_t handle)') as BoolFn,
    // PRINTER_INFO_2W：x64 布局下 pPortName 位于偏移 24、pDevMode 位于偏移 56（指针均指向缓冲区内部）
    getInfo: lib.func('bool GetPrinterW(uint64_t handle, uint32_t level, void *buf, uint32_t bufSize, uint32_t *needed)') as BoolFn,
    // 返回值按 int32 处理：失败 -1（DWORD 视角是巨值，按无符号处理会误分配超大缓冲）
    caps: lib.func('int32_t DeviceCapabilitiesW(const wchar_t *device, const wchar_t *port, uint16_t cap, void *out, void *pDevMode)') as CountFn,
    getForm: lib.func('bool GetFormW(uint64_t handle, const wchar_t *name, uint32_t level, void *buf, uint32_t bufSize, uint32_t *needed)') as BoolFn,
  }
}

/** 从缓冲区 base 偏移手工读 DEVMODEW 默认值（按 dmFields 有效位取值，越界或全零返回 null） */
function readDevmodeDefaults(buf: Buffer, base: number): PrinterDefaults | null {
  if (base < 0 || base + DEVMODE_MIN_SIZE > buf.length) { return null }
  const fields = buf.readUInt32LE(base + DM_OFFSET_FIELDS)
  if (!fields) { return null }
  const defaults: PrinterDefaults = {}
  if (fields & DM_FORMNAME) {
    // dmFormName 为 wchar 串（尾部 NUL 填充），逐字符读到空字符
    let name = ''
    for (let i = 0; i < DEVMODE_FORMNAME_CHARS; i++) {
      const ch = buf.readUInt16LE(base + DM_OFFSET_FORMNAME + i * 2)
      if (!ch) { break }
      name += String.fromCharCode(ch)
    }
    if (name) { defaults.formName = name }
  }
  if (fields & DM_ORIENTATION) { defaults.orientation = buf.readInt16LE(base + DM_OFFSET_ORIENTATION) === 2 ? 'landscape' : 'portrait' }
  if (fields & DM_DUPLEX) {
    // DMDUP_SIMPLEX=1、DMDUP_VERTICAL=2（长边装订）、DMDUP_HORIZONTAL=3（短边装订）
    const duplex = buf.readInt16LE(base + DM_OFFSET_DUPLEX)
    defaults.duplex = duplex === 3 ? 'duplexshort' : duplex === 2 ? 'duplexlong' : 'simplex'
  }
  if (fields & DM_COLOR) { defaults.color = buf.readInt16LE(base + DM_OFFSET_COLOR) === 2 }
  const copies = buf.readInt16LE(base + DM_OFFSET_COPIES)
  if (fields & DM_COPIES && copies > 1) { defaults.copies = copies }
  return defaults
}

/** 从驱动表单名解析尺寸（如 "2 x 4 inch(50.8 * 101.6mm)" / "70 x 50mm"），mm 优先于 inch */
function dimsFromName(name: string): { widthMm: number, heightMm: number } | undefined {
  const mm = name.match(/(\d+(?:\.\d+)?)\s*[*x×]\s*(\d+(?:\.\d+)?)\s*(?:mm|毫米)/i)
  if (mm) {
    return { widthMm: Number(mm[1]), heightMm: Number(mm[2]) }
  }
  const inch = name.match(/(\d+(?:\.\d+)?)\s*[*x×]\s*(\d+(?:\.\d+)?)\s*(?:inch|″|")/i)
  if (inch) {
    return { widthMm: Math.round(Number(inch[1]) * 254) / 10, heightMm: Math.round(Number(inch[2]) * 254) / 10 }
  }
  return undefined
}

/**
 * GetFormW(LEVEL 1) 按表单名查询物理尺寸（FORM_INFO_1W.Size 单位 0.001mm）。
 * 驱动不支持 DeviceCapabilities 尺寸枚举时（如 DASCOM 针打），用户手动新增的自定义表单
 * 尺寸也能从这里拿到。失败返回 undefined（不致命，落到表单名解析）。
 */
function getFormSize(koffi: KoffiModule, getForm: BoolFn, handle: number | bigint, name: string): { widthMm: number, heightMm: number } | undefined {
  const neededBuf = koffi.alloc('uint32_t', 1)
  getForm(handle, name, 1, null, 0, neededBuf)
  const needed = koffi.decode(neededBuf, 0, 'uint32_t') as number
  if (!needed) { return undefined }
  const buf = Buffer.alloc(needed)
  if (!getForm(handle, name, 1, buf, needed, neededBuf)) { return undefined }
  const widthUm = buf.readInt32LE(16)
  const heightUm = buf.readInt32LE(20)
  return widthUm > 0 && heightUm > 0 ? { widthMm: widthUm / 1000, heightMm: heightUm / 1000 } : undefined
}

export function queryWinspoolForms(printerName: string): PrinterPaper[] | null {
  if (process.platform !== 'win32' || !koffiAvailable()) { return null }

  let close: (() => void) | undefined
  try {
    const koffi = requireKoffi()
    const { open, close: closePrinter, getInfo, caps, getForm } = declareFns(koffi)

    const handleBuf = koffi.alloc('uint64_t', 1)
    if (!open(printerName, handleBuf, null)) { return null }
    const handle = koffi.decode(handleBuf, 0, 'uint64_t') as number | bigint
    close = () => {
      closePrinter(handle)
    }

    const neededBuf = koffi.alloc('uint32_t', 1)
    getInfo(handle, 2, null, 0, neededBuf)
    const needed = koffi.decode(neededBuf, 0, 'uint32_t') as number
    if (!needed) { return null }
    const infoBuf = Buffer.alloc(needed)
    if (!getInfo(handle, 2, infoBuf, needed, neededBuf)) { return null }
    const port = (koffi.decode(infoBuf, 24, 'wchar_t *') as string | undefined)?.split(',')[0] ?? ''
    if (!port) { return null }

    const count = caps(printerName, port, DC_PAPERNAMES, null, null)
    if (count < 0) { return null }
    if (count === 0) { return [] }

    const namesBuf = Buffer.alloc(count * FORM_NAME_CHARS * 2)
    if (caps(printerName, port, DC_PAPERNAMES, namesBuf, null) !== count) { return null }

    // DC_PAPERSIZE 与 DC_PAPERNAMES 平行；部分驱动不支持（返回值对不上），此时退化用表单名解析尺寸
    let sizeBuf: Buffer | undefined
    if (caps(printerName, port, DC_PAPERSIZE, null, null) === count) {
      const buf = Buffer.alloc(count * 8)
      if (caps(printerName, port, DC_PAPERSIZE, buf, null) === count) { sizeBuf = buf }
    }

    const papers: PrinterPaper[] = []
    for (let i = 0; i < count; i++) {
      const name = koffi.decode(namesBuf, i * FORM_NAME_CHARS * 2, `wchar_t[${FORM_NAME_CHARS}]`) as string | undefined
      if (!name) { continue }
      // 尺寸优先级：DC_PAPERSIZE（0.1mm POINT）→ GetFormW 表单库（0.001mm）→ 表单名解析
      const widthMm = sizeBuf ? sizeBuf.readInt32LE(i * 8) / 10 : 0
      const heightMm = sizeBuf ? sizeBuf.readInt32LE(i * 8 + 4) / 10 : 0
      const dims = widthMm > 0 ? { widthMm, heightMm } : getFormSize(koffi, getForm, handle, name) ?? dimsFromName(name)
      papers.push({
        name,
        ...(dims && dims.widthMm > 0 ? { widthMm: dims.widthMm } : {}),
        ...(dims && dims.heightMm > 0 ? { heightMm: dims.heightMm } : {}),
      })
    }
    return papers
  }
  catch {
    return null
  }
  finally {
    close?.()
  }
}

/** 打印机硬件默认值 + 能力位（Windows 来源） */
export interface WinspoolHardware {
  defaults: PrinterDefaults
  duplexSupported: boolean
  colorSupported: boolean
}

/**
 * 驱动默认值与能力位：GetPrinterW level 2 的 pDevMode（偏移 56，指向缓冲区内部）经
 * koffi.address 换算偏移后手工解析打印首选项默认值，DC_DUPLEX / DC_COLORDEVICE 读能力。
 * DEVMODE 解析失败仅缺 defaults，能力位仍有效；整体失败返回 null。
 */
export function queryWinspoolHardware(printerName: string): WinspoolHardware | null {
  if (process.platform !== 'win32' || !koffiAvailable()) { return null }

  let close: (() => void) | undefined
  try {
    const koffi = requireKoffi()
    const { open, close: closePrinter, getInfo, caps } = declareFns(koffi)

    const handleBuf = koffi.alloc('uint64_t', 1)
    if (!open(printerName, handleBuf, null)) { return null }
    const handle = koffi.decode(handleBuf, 0, 'uint64_t') as number | bigint
    close = () => {
      closePrinter(handle)
    }

    const neededBuf = koffi.alloc('uint32_t', 1)
    getInfo(handle, 2, null, 0, neededBuf)
    const needed = koffi.decode(neededBuf, 0, 'uint32_t') as number
    if (!needed) { return null }
    const infoBuf = Buffer.alloc(needed)
    if (!getInfo(handle, 2, infoBuf, needed, neededBuf)) { return null }

    const hardware: WinspoolHardware = {
      defaults: {},
      duplexSupported: caps(printerName, '', DC_DUPLEX, null, null) > 0,
      colorSupported: caps(printerName, '', DC_COLORDEVICE, null, null) > 0,
    }

    // pDevMode 是指向缓冲区内部的指针：取指针值与缓冲区地址换算出 DEVMODE 在缓冲区内的偏移
    try {
      const devmodePtr = koffi.decode(infoBuf, 56, 'uint64_t') as bigint | number
      const infoAddr = koffi.address(infoBuf)
      const base = Number(BigInt(devmodePtr) - BigInt(infoAddr))
      const defaults = readDevmodeDefaults(infoBuf, base)
      if (defaults) { hardware.defaults = defaults }
    }
    catch {
      // DEVMODE 解析失败：仅默认值缺省，能力位保留
    }

    return hardware
  }
  catch {
    return null
  }
  finally {
    close?.()
  }
}
