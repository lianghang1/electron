import { spawn } from 'node:child_process'
import process from 'node:process'

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
 * 设备纸张表单上报：打印机驱动里定义的纸张/表单名
 *   - Windows: Win32_Printer.PrinterPaperNames（一次性批量查询，缓存 5 分钟）
 *   - macOS/Linux: CUPS `lpoptions -p <queue> -l` 的 PageSize 项
 * 用途：UI 展示设备能力、CUPS 送打时按表单名 -o media= 匹配。
 */

const formsCache = new Map<string, { at: number, forms: string[] }>()
const FORMS_TTL = 5 * 60 * 1000

export function detectPaperForms(printerName: string): Promise<string[]> {
  const cached = formsCache.get(printerName)
  if (cached && Date.now() - cached.at < FORMS_TTL)
    return Promise.resolve(cached.forms)

  if (process.platform === 'win32') {
    return loadWindowsForms().then((map) => {
      const forms = map.get(printerName) ?? []
      formsCache.set(printerName, { at: Date.now(), forms })
      return forms
    })
  }

  return new Promise((resolve) => {
    let done = false
    const finish = (forms: string[]): void => {
      if (done)
        return
      done = true
      formsCache.set(printerName, { at: Date.now(), forms })
      resolve(forms)
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
        finish(values.map(v => v.replace(/^\*/, '')))
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
