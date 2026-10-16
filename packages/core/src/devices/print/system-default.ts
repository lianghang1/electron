import type { PrinterDefaults, PrinterPaper } from '@desktop/shared'
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { gunzipSync } from 'node:zlib'
import { queryWinspoolForms, queryWinspoolHardware } from './winspool-forms'

/** 设备守护进程窄接口（结构性类型，避免模块耦合）：winspool 同步 koffi 调用经此进 utility 进程 */
export interface WinspoolHost {
  request: <T>(method: string, payload?: unknown) => Promise<T>
}

/**
 * winspool 探测经守护进程（utilityProcess）执行：GetFormW 逐表单循环 / GetPrinterW 都是同步 koffi
 * 调用，留在主进程会阻塞事件循环（整窗冻结数秒）。host 未接线时回退主进程直调（旧行为）；
 * 已接线但守护进程失败（崩溃退避/超时）返回 null，调用方走既有的 WMI 子进程 / 无默认值降级，
 * 绝不回退主进程直调——探测失败宁可降级，也不能冻结窗口。
 */
async function winspoolViaHost<T>(host: WinspoolHost | undefined, method: string, printerName: string, direct: () => T): Promise<T | null> {
  if (!host) {
    return direct()
  }
  try {
    return await host.request<T>(method, { printerName })
  }
  catch {
    return null
  }
}

/**
 * 系统默认打印机探测。
 * Electron 37 起 PrinterInfo 不再携带 isDefault/status 字段，改由 OS 查询：
 *   - Windows: PowerShell CIM（Win32_Printer.Default）
 *   - macOS/Linux: CUPS `lpstat -d`
 * 结果缓存 60s（默认打印机极少变化）。
 */
let cached: { name: string | undefined, at: number } = { name: undefined, at: 0 }

export function detectSystemDefaultPrinter(): Promise<string | undefined> {
  if (Date.now() - cached.at < 60_000)
    return Promise.resolve(cached.name)

  return new Promise((resolve) => {
    let done = false
    const finish = (name: string | undefined) => {
      if (done)
        return
      done = true
      cached = { name, at: Date.now() }
      resolve(name)
    }

    let cmd: string
    let args: string[]
    if (process.platform === 'win32') {
      cmd = 'powershell'
      args = ['-NoProfile', '-Command', '(Get-CimInstance Win32_Printer -Filter \'Default=true\').Name']
    }
    else {
      cmd = 'lpstat'
      args = ['-d']
    }

    try {
      const child = spawn(cmd, args, { windowsHide: true })
      let out = ''
      child.stdout?.on('data', (d) => {
        out += String(d)
      })
      child.on('error', () => finish(undefined))
      child.on('close', (code) => {
        if (code !== 0)
          return finish(undefined)
        if (process.platform === 'win32') {
          finish(out.trim().split(/\r?\n/)[0]?.trim() || undefined)
        }
        else {
          const m = out.match(/destination:\s*(\S+)/)
          finish(m?.[1])
        }
      })
    }
    catch {
      finish(undefined)
    }
  })
}

/**
 * 设备纸张上报：打印机驱动里定义的纸张（表单名 + 物理尺寸）
 *   - Windows: 优先 winspool DeviceCapabilitiesW 直调（名字 + 尺寸齐全）；koffi 缺失或失败时
 *     回落 PowerShell CIM（Win32_Printer.PrinterPaperNames，WMI 代理对 v4/热敏驱动普遍残缺，仅有名字）
 *   - macOS/Linux（含国产化 UOS/麒麟，均为 CUPS 体系）: `lpoptions -p <queue> -l` 的 PageSize 项，
 *     尺寸从驱动 PPD 的 *PaperDimension 解析（针打自定义纸型同样登记在 PPD 中）
 * 结果缓存 5 分钟。UI 纸型下拉随打印机联动、设备能力审计均以本数据为源。
 */

const papersCache = new Map<string, { at: number, papers: PrinterPaper[] }>()
const PAPERS_TTL = 5 * 60 * 1000

/** 表单名列表 → 统一结构（尺寸可选），原名原样不映射 */
function toPapers(names: string[], sizes?: Array<{ widthMm?: number, heightMm?: number } | undefined>): PrinterPaper[] {
  return names.map((name, i) => {
    const size = sizes?.[i]
    return {
      name,
      ...(size?.widthMm ? { widthMm: size.widthMm } : {}),
      ...(size?.heightMm ? { heightMm: size.heightMm } : {}),
    }
  })
}

/**
 * CUPS 队列的驱动 PPD 尺寸解析：*PaperDimension <名>: "<宽> <高>"（单位 pt，1pt = 1/72 英寸）。
 * PPD 位于 /etc/cups/ppd/<队列>.ppd(.gz)，队列名中的 / 会转义为 _。读取失败返回空表（仅名字）。
 */
async function loadCupsPaperSizes(printerName: string): Promise<Map<string, { widthMm: number, heightMm: number }>> {
  const base = `/etc/cups/ppd/${printerName.replace(/\//g, '_')}.ppd`
  for (const file of [`${base}.gz`, base]) {
    try {
      const raw = await readFile(file)
      const text = file.endsWith('.gz') ? gunzipSync(raw).toString('utf8') : raw.toString('utf8')
      const sizes = new Map<string, { widthMm: number, heightMm: number }>()
      for (const m of text.matchAll(/\*PaperDimension\s+(\S+):\s*"(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)"/g)) {
        sizes.set(m[1], {
          widthMm: Math.round((Number(m[2]) / 72) * 254) / 10,
          heightMm: Math.round((Number(m[3]) / 72) * 254) / 10,
        })
      }
      return sizes
    }
    catch {
      // 换下一种路径形态（.ppd.gz → .ppd）
    }
  }
  return new Map()
}

/** 打印机硬件默认值与能力位（null = 平台查询失败，调用方按无默认值处理） */
export interface PrinterHardwareInfo {
  /** 驱动默认值（打印首选项），恒为对象；单字段缺省表示该平台未提供 */
  defaults: PrinterDefaults
  duplexSupported: boolean
  colorSupported: boolean
}

const hardwareCache = new Map<string, { at: number, hw: PrinterHardwareInfo | null }>()

/**
 * 打印机硬件默认值与能力位：
 *   - Windows: winspool DEVMODE 默认值 + DC_DUPLEX / DC_COLORDEVICE 能力枚举
 *   - macOS/Linux（CUPS）: `lpoptions -l` 中带 * 的选项即默认值，Duplex / ColorModel 选项同时给出能力位
 * 结果缓存 5 分钟，与纸型查询同源（lpoptions -l 一次拿全）。
 */
export async function detectPrinterHardware(printerName: string, host?: WinspoolHost): Promise<PrinterHardwareInfo | null> {
  const cached = hardwareCache.get(printerName)
  if (cached && Date.now() - cached.at < PAPERS_TTL)
    return cached.hw

  const finish = (hw: PrinterHardwareInfo | null): PrinterHardwareInfo | null => {
    hardwareCache.set(printerName, { at: Date.now(), hw })
    return hw
  }

  if (process.platform === 'win32') {
    const hw = await winspoolViaHost(host, 'print.winspoolHardware', printerName, () => queryWinspoolHardware(printerName))
    return finish(hw)
  }

  return finish(await new Promise<PrinterHardwareInfo | null>((resolve) => {
    let done = false
    const complete = (hw: PrinterHardwareInfo | null): void => {
      if (done)
        return
      done = true
      resolve(hw)
    }
    try {
      const child = spawn('lpoptions', ['-p', printerName, '-l'], { windowsHide: true })
      let out = ''
      child.stdout?.on('data', (d) => {
        out += String(d)
      })
      child.on('error', () => complete(null))
      child.on('close', () => {
        const hw: PrinterHardwareInfo = { defaults: {}, duplexSupported: false, colorSupported: false }
        for (const line of out.split(/\r?\n/)) {
          // 行格式：OptionName/翻译: opt1 *default opt3 …（带 * 为当前默认值）
          const m = line.match(/^([^:]+):\s*(\S.*)$/)
          if (!m)
            continue
          const key = m[1].split('/')[0].trim()
          const opts = m[2].trim().split(/\s+/).filter(Boolean)
          const starred = opts.find(o => o.startsWith('*'))?.slice(1)
          if (key === 'Duplex') {
            hw.duplexSupported = opts.some(o => /^Duplex/i.test(o.replace(/^\*/, '')))
            hw.defaults.duplex = starred === 'DuplexNoTumble' ? 'duplexlong' : starred === 'DuplexTumble' ? 'duplexshort' : 'simplex'
          }
          else if (key === 'ColorModel') {
            // 非灰度选项存在 = 支持彩色；当前默认非灰度 = 默认彩色输出
            hw.colorSupported = opts.some(o => !/^(?:Gray|Black|Mono)/i.test(o.replace(/^\*/, '')))
            hw.defaults.color = starred ? !/^(?:Gray|Black|Mono)/i.test(starred) : false
          }
          else if (key === 'PageSize' && starred) {
            hw.defaults.formName = starred
          }
        }
        complete(hw)
      })
    }
    catch {
      complete(null)
    }
  }))
}

export async function detectPrinterPapers(printerName: string, host?: WinspoolHost): Promise<PrinterPaper[]> {
  const cached = papersCache.get(printerName)
  if (cached && Date.now() - cached.at < PAPERS_TTL)
    return Promise.resolve(cached.papers)

  if (process.platform === 'win32') {
    // winspool 直调返回 null 才回落 WMI；空数组 = 驱动真实上报无表单，信任之
    const direct = await winspoolViaHost(host, 'print.winspoolForms', printerName, () => queryWinspoolForms(printerName))
    if (direct) {
      papersCache.set(printerName, { at: Date.now(), papers: direct })
      return direct
    }
    return loadWindowsForms().then((map) => {
      const papers = toPapers(map.get(printerName) ?? [])
      papersCache.set(printerName, { at: Date.now(), papers })
      return papers
    })
  }

  return new Promise((resolve) => {
    let done = false
    const finish = (names: string[], sizes?: Map<string, { widthMm: number, heightMm: number }>): void => {
      if (done)
        return
      done = true
      const papers = toPapers(names, names.map(n => sizes?.get(n)))
      papersCache.set(printerName, { at: Date.now(), papers })
      resolve(papers)
    }
    try {
      const child = spawn('lpoptions', ['-p', printerName, '-l'], { windowsHide: true })
      let out = ''
      child.stdout?.on('data', (d) => {
        out += String(d)
      })
      child.on('error', () => finish([]))
      child.on('close', () => {
        // PageSize/Media size: *A4 Letter Legal …
        const line = out.split(/\r?\n/).find(l => l.startsWith('PageSize'))
        if (!line)
          return finish([])
        const values = line.split(':')[1]?.trim().split(/\s+/) ?? []
        if (!values.length)
          return finish([])
        loadCupsPaperSizes(printerName).then(sizes => finish(values.map(v => v.replace(/^\*/, '')), sizes))
      })
    }
    catch {
      finish([])
    }
  })
}

let winFormsPromise: Promise<Map<string, string[]>> | null = null

function loadWindowsForms(): Promise<Map<string, string[]>> {
  if (winFormsPromise)
    return winFormsPromise
  winFormsPromise = new Promise((resolve) => {
    try {
      const child = spawn(
        'powershell',
        ['-NoProfile', '-Command', 'Get-CimInstance Win32_Printer | Select-Object Name, PrinterPaperNames | ConvertTo-Json -Compress -Depth 3'],
        { windowsHide: true },
      )
      let out = ''
      child.stdout?.on('data', (d) => {
        out += String(d)
      })
      child.on('error', () => resolve(new Map()))
      child.on('close', () => {
        const map = new Map<string, string[]>()
        try {
          const parsed = JSON.parse(out) as
            | { Name: string, PrinterPaperNames?: string[] }
            | Array<{ Name: string, PrinterPaperNames?: string[] }>
          const list = Array.isArray(parsed) ? parsed : [parsed]
          for (const item of list) {
            if (item?.Name)
              map.set(item.Name, Array.isArray(item.PrinterPaperNames) ? item.PrinterPaperNames : [])
          }
        }
        catch {
          /* 解析失败按无表单处理 */
        }
        resolve(map)
      })
    }
    catch {
      resolve(new Map())
    }
  })
  return winFormsPromise
}
