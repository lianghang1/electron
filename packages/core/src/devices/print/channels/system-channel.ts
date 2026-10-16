import type { PaperSpec, PrintOptions, UnifiedPrinter } from '@desktop/shared'
import type { HiddenWindowPool } from '../hidden-window'
import type { PreparedJob } from './channel-types'
import type { ChannelOutcome, PrintChannel } from './print-channel'
import { spawn } from 'node:child_process'

import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { printError } from '../errors'
import { loadHtmlInto, webContentsPrint } from '../hidden-window'
import { paperToPdfPageSize, paperToPrintPageSize } from '../paper'
import { withTimeout } from '../with-timeout'

/**
 * 系统打印队列通道：
 * - HTML（模板/图片）：隐藏窗口渲染 → webContents.print（静默）+ printToPDF 存档
 * - PDF 文件：Windows 优先 SumatraPDF 静默送打（未打包则退回 Chromium PDF 插件窗口）；
 *             macOS/Linux 用 CUPS 的 lp 命令
 */
export class SystemChannel implements PrintChannel {
  readonly id = 'system' as const

  constructor(
    private readonly windows: HiddenWindowPool,
    private readonly archiveDir: string,
    /** SumatraPDF 绝对路径（宿主经资源根注入）；缺省/未就位时 PDF 直通回退 Chromium 窗口 */
    private readonly sumatraPath?: string,
  ) {}

  private resolveSumatraPath(): string | null {
    return this.sumatraPath && existsSync(this.sumatraPath) ? this.sumatraPath : null
  }

  async execute(job: PreparedJob, printer: UnifiedPrinter): Promise<ChannelOutcome> {
    if (printer.source !== 'system') {
      throw printError('VALIDATION_FAILED', 'system 通道仅支持系统已安装驱动的打印机', { printerId: printer.id })
    }

    switch (job.content.type) {
      case 'html':
        return this.printHtml(job, printer, job.content.html)
      case 'pdf':
        return this.printPdfFile(job, printer, job.content.path)
    }
  }

  private printHtml(job: PreparedJob, printer: UnifiedPrinter, html: string): Promise<ChannelOutcome> {
    // paper 可缺省（undefined = 交驱动默认纸张）；局部常量保证闭包内类型收窄
    const paper = job.paper
    // 渲染+存档+打印必须在同一个窗口锁内完成，否则并发 submit 会互相打断渲染
    return this.windows.runExclusive('utility', async (win) => {
      await loadHtmlInto(win, html)
      const wc = win.webContents

      // 连续纸（小票/连续标签）没有 pageSize 概念：省略后交给驱动纸卷设置；
      // 此时"默认边距"应视为零边距（模板自带内边距），否则 Chromium 默认边距会引起回流
      const pageSize = paperToPrintPageSize(paper)
      const continuous = pageSize === undefined
      const m = job.options.margin
      const effectiveMargin: PrintOptions['margin']
        = continuous && (m == null || m === 'default') ? 'none' : (m ?? 'default')

      // 1) PDF 存档（重打/审计依据）——preferCSSPageSize 让模板 @page 决定卷纸宽度
      const pdfBuffer = await withTimeout(
        wc.printToPDF({
          landscape: job.options.landscape === true,
          printBackground: true,
          preferCSSPageSize: true,
          pageSize: paperToPdfPageSize(paper),
          margins: pdfMarginsInches(effectiveMargin),
        }),
        30000,
        'RENDER_FAILED',
        'PDF 存档导出超时（30s）',
      )
      await mkdir(this.archiveDir, { recursive: true })
      const archivedPdfPath = path.join(this.archiveDir, `${job.jobId}.pdf`)
      await writeFile(archivedPdfPath, pdfBuffer)

      // 2) 送系统打印队列
      const printOpts: Electron.WebContentsPrintOptions = {
        silent: job.options.silent !== false,
        printBackground: true,
        color: !job.options.grayscale,
        landscape: job.options.landscape === true,
        copies: Math.max(1, job.options.copies ?? 1),
      }
      if (job.options.duplex) { printOpts.duplexMode = duplexMode(job.options.duplex) }
      const ranges = parsePageRanges(job.options.pages)
      if (ranges) { printOpts.pageRanges = ranges }
      if (job.options.silent !== false) {
        // 静默：必须显式指定设备名（未指定则走系统默认打印机）
        printOpts.deviceName = printer.id
        printOpts.margins = wcMarginType(effectiveMargin)
        if (pageSize) { printOpts.pageSize = pageSize }
      }
      await withTimeout(webContentsPrint(wc, printOpts), 60000, 'JOB_FAILED', '打印提交超时（60s）')

      return { archivedPdfPath, detail: { deviceName: printer.id } }
    })
  }

  private async printPdfFile(job: PreparedJob, printer: UnifiedPrinter, pdfPath: string): Promise<ChannelOutcome> {
    if (!existsSync(pdfPath)) {
      throw printError('VALIDATION_FAILED', `PDF 文件不存在: ${pdfPath}`)
    }
    const copies = Math.max(1, job.options.copies ?? 1)

    if (process.platform === 'win32') {
      const sumatra = this.resolveSumatraPath()
      if (sumatra) {
        // SumatraPDF -print-settings：份数、页码范围、奇偶页、黑白、双面、纸张、纸盒、缩放
        const settings: string[] = []
        if (copies > 1) { settings.push(`${copies}x`) }
        if (job.options.pages) { settings.push(job.options.pages) }
        if (job.options.subset) { settings.push(job.options.subset) }
        if (job.options.grayscale) { settings.push('monochrome') }
        if (job.options.duplex && job.options.duplex !== 'simplex') { settings.push(job.options.duplex) }
        if (job.options.landscape) { settings.push('landscape') }
        const paperName = sumatraPaperName(job.paper)
        if (paperName) { settings.push(`paper=${paperName}`) }
        if (job.options.bin) { settings.push(`bin=${job.options.bin}`) }
        settings.push(job.options.scale ?? 'fit')
        const args = ['-print-to', printer.id, '-silent', '-print-settings', settings.join(','), pdfPath]
        await withTimeout(runProcess(sumatra, args), 90000, 'SPOOL_FAILED', `SumatraPDF 送打超时（90s）`)
        return { archivedPdfPath: pdfPath, detail: { via: 'SumatraPDF', settings: settings.join(',') } }
      }
      // 未打包 SumatraPDF：退回 Chromium PDF 插件窗口打印（无需外部依赖）
      await this.windows.runExclusive('pdf', async (win) => {
        await win.loadFile(pdfPath)
        await win.webContents.executeJavaScript(
          'document.readyState === "complete" ? true : new Promise(r => window.addEventListener("load", () => r(true)))',
        )
        const opts: Record<string, unknown> = {
          silent: job.options.silent !== false,
          deviceName: printer.id,
          copies,
          printBackground: true,
        }
        if (job.options.duplex) { opts.duplexMode = duplexMode(job.options.duplex) }
        const ranges = parsePageRanges(job.options.pages)
        if (ranges) { opts.pageRanges = ranges }
        await webContentsPrint(win.webContents, opts as never)
      })
      return { archivedPdfPath: pdfPath, detail: { via: 'chromium-pdf-plugin' } }
    }

    // macOS / Linux（含国产化 OS）：CUPS lp（纸盒 InputSlot 为 CUPS 通用约定，具体名依驱动）
    const args = ['-d', printer.id, '-n', String(copies), '-t', sanitizeJobName(job.jobName), pdfPath]
    if (job.options.pages) { args.unshift('-P', job.options.pages) }
    if (job.options.subset) { args.unshift('-o', `page-set=${job.options.subset}`) }
    if (job.options.grayscale) { args.unshift('-o', 'ColorModel=Gray') }
    if (job.options.landscape) { args.unshift('-o', 'landscape') }
    const sides = lpSides(job.options.duplex)
    if (sides) { args.unshift('-o', `sides=${sides}`) }
    if (job.options.bin) { args.unshift('-o', `InputSlot=${job.options.bin}`) }
    if (job.options.scale === 'fit') { args.unshift('-o', 'fit-to-page') }
    for (const [k, v] of lpMarginOptions(job.options.margin)) { args.unshift('-o', `${k}=${v}`) }
    await withTimeout(runProcess('lp', args), 90000, 'SPOOL_FAILED', 'lp 送打超时（90s）')
    return { archivedPdfPath: pdfPath, detail: { via: 'cups-lp' } }
  }
}

/** 统一 duplex 语义 → Electron print duplexMode */
function duplexMode(duplex: PrintOptions['duplex']): NonNullable<Electron.WebContentsPrintOptions['duplexMode']> {
  switch (duplex) {
    case 'duplexshort':
      return 'shortEdge'
    case 'duplexlong':
      return 'longEdge'
    default:
      return 'longEdge'
  }
}

const mmToInch = (mm: number): number => Math.max(0, mm) / 25.4
const mmToPt = (mm: number): number => Math.max(0, mm) * 2.83465

/** webContents.print 的 margins（静默路径）：默认跟随/零边距/自定义英寸 */
function wcMarginType(margin: PrintOptions['margin']): Record<string, unknown> {
  if (margin === 'default') { return { marginType: 'default' } }
  if (margin == null || margin === 'none') { return { marginType: 'none' } }
  return {
    marginType: 'custom',
    top: mmToInch(margin.topMm),
    bottom: mmToInch(margin.bottomMm),
    left: mmToInch(margin.leftMm),
    right: mmToInch(margin.rightMm),
  }
}

/** printToPDF 存档 margins（英寸）：default 省略由 Chromium 决定 */
function pdfMarginsInches(margin: PrintOptions['margin']): Record<string, number> {
  if (margin === 'default' || margin == null) { return { top: 9.6 / 25.4, bottom: 9.6 / 25.4, left: 9.6 / 25.4, right: 9.6 / 25.4 } }
  if (margin === 'none') { return { top: 0, bottom: 0, left: 0, right: 0 } }
  return {
    top: mmToInch(margin.topMm),
    bottom: mmToInch(margin.bottomMm),
    left: mmToInch(margin.leftMm),
    right: mmToInch(margin.rightMm),
  }
}

/** CUPS lp 页边距（点）：仅 none/自定义生效，default 不传由系统决定 */
function lpMarginOptions(margin: PrintOptions['margin']): Array<[string, string]> {
  if (margin === 'default' || margin == null) { return [] }
  if (margin === 'none') {
    return [['page-top', '0'], ['page-bottom', '0'], ['page-left', '0'], ['page-right', '0']]
  }
  return [
    ['page-top', String(Math.round(mmToPt(margin.topMm)))],
    ['page-bottom', String(Math.round(mmToPt(margin.bottomMm)))],
    ['page-left', String(Math.round(mmToPt(margin.leftMm)))],
    ['page-right', String(Math.round(mmToPt(margin.rightMm)))],
  ]
}

/** "1-3,5" → Electron pageRanges；非法输入返回 null（由调用方决定跳过） */
function parsePageRanges(pages: string | undefined): Array<{ from: number, to: number }> | null {
  if (!pages?.trim()) { return null }
  const ranges: Array<{ from: number, to: number }> = []
  for (const part of pages.split(',')) {
    const m = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/)
    if (!m) { return null }
    const from = Number(m[1])
    ranges.push(m[2] ? { from, to: Number(m[2]) } : { from, to: from })
  }
  return ranges.length > 0 ? ranges : null
}

/** 物理尺寸 → SumatraPDF paper= 标准名（仅 SumatraPDF 认识的标准系列；其他尺寸不传 paper=，交给 fit 缩放） */
function sumatraPaperName(paper?: PaperSpec): string | null {
  if (!paper || paper.heightMm <= 0) { return null }
  switch (`${paper.widthMm}x${paper.heightMm}`) {
    case '210x297':
      return 'A4'
    case '148x210':
      return 'A5'
    case '216x279':
      return 'Letter'
    case '216x356':
      return 'Legal'
    case '279x432':
      return 'Tabloid'
    default:
      return null
  }
}

/** 统一 duplex 语义 → CUPS sides 值 */
function lpSides(duplex: PrintOptions['duplex']): string | null {
  switch (duplex) {
    case 'duplex':
    case 'duplexlong':
      return 'two-sided-long-edge'
    case 'duplexshort':
      return 'two-sided-short-edge'
    case 'simplex':
      return 'one-sided'
    default:
      return null
  }
}

function sanitizeJobName(name: string): string {
  return name.replace(/[^\w\u4E00-\u9FA5.-]+/g, '_').slice(0, 80)
}

function runProcess(cmd: string, args: string[], timeoutMs = 90000): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true })
    let stderr = ''
    let settled = false
    const timer = setTimeout(() => {
      settled = true
      try {
        child.kill()
      }
      catch {
        /* 忽略 */
      }
      reject(printError('SPOOL_FAILED', `打印命令超时（${timeoutMs}ms）`, { cmd }))
    }, timeoutMs)
    const finish = (fn: () => void): void => {
      if (settled) { return }
      settled = true
      clearTimeout(timer)
      fn()
    }
    child.stderr?.on('data', (d) => {
      stderr += String(d)
    })
    child.on('error', (err) => {
      finish(() => {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          reject(printError('CHANNEL_UNAVAILABLE', `未找到打印命令: ${cmd}`))
        }
        else {
          reject(printError('SPOOL_FAILED', `打印命令执行失败: ${err.message}`))
        }
      })
    })
    child.on('close', (code) => {
      finish(() => {
        if (code === 0) { resolve() }
        else { reject(printError('SPOOL_FAILED', `打印命令退出码 ${code}`, { cmd, stderr: stderr.trim() })) }
      })
    })
  })
}
