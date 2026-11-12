import type { UnifiedPrinter } from '@shell/shared'
import type { HiddenWindowPool } from '../hidden-window'
import type { PreparedJob } from './prepared-job'
import type { ChannelOutcome, PrintChannel } from './print-channel'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { isWindowsHost } from '../../platform'
import { printError } from '../errors'
import { loadHtmlInto, webContentsPrint } from '../hidden-window'
import { withPrintDeadline } from '../operation-deadline'
import { paperToPdfPageSize, paperToPrintPageSize } from '../paper'
import {
  PDF_EXPORT_TIMEOUT_CODE,
  PDF_EXPORT_TIMEOUT_MESSAGE,
  PDF_EXPORT_TIMEOUT_MS,
  pdfMarginsInches,
  resolveEffectiveMargin,
  writePdfArchive,
} from './pdf-export'
import { buildLpArgs, buildSumatraArgs, classifyProcessFailure, duplexMode, parsePageRanges, sumatraPrintSettings, wcMarginType } from './print-args'

/**
 * 系统打印队列通道：
 * - HTML（模板/图片）：隐藏窗口渲染 → webContents.print（静默）+ printToPDF 存档
 * - PDF 文件：Windows 优先 SumatraPDF 静默送打（未打包则退回 Chromium PDF 插件窗口）；
 *             macOS/Linux 用 CUPS 的 lp 命令
 */
export class SystemChannel implements PrintChannel {
  readonly id = 'system' as const
  readonly descriptorId = 'chromium-hidden-window'
  readonly spools = true

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

      const pageSize = paperToPrintPageSize(paper)
      const effectiveMargin = resolveEffectiveMargin(job)

      // 1) PDF 存档（重打/审计依据）——preferCSSPageSize 让模板 @page 决定卷纸宽度
      const pdfBuffer = await withPrintDeadline(
        wc.printToPDF({
          landscape: job.options.landscape === true,
          printBackground: true,
          preferCSSPageSize: true,
          pageSize: paperToPdfPageSize(paper),
          margins: pdfMarginsInches(effectiveMargin),
        }),
        PDF_EXPORT_TIMEOUT_MS,
        PDF_EXPORT_TIMEOUT_CODE,
        PDF_EXPORT_TIMEOUT_MESSAGE,
      )
      const archivedPdfPath = await writePdfArchive(pdfBuffer, job.jobId, this.archiveDir)

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
      await withPrintDeadline(webContentsPrint(wc, printOpts), 60000, 'JOB_FAILED', '打印提交超时（60s）')

      return { archivedPdfPath, detail: { deviceName: printer.id } }
    })
  }

  private async printPdfFile(job: PreparedJob, printer: UnifiedPrinter, pdfPath: string): Promise<ChannelOutcome> {
    if (!existsSync(pdfPath)) {
      throw printError('VALIDATION_FAILED', `PDF 文件不存在: ${pdfPath}`)
    }
    const copies = Math.max(1, job.options.copies ?? 1)

    if (isWindowsHost()) {
      const sumatra = this.resolveSumatraPath()
      if (sumatra) {
        const args = buildSumatraArgs({ printerId: printer.id, pdfPath, options: job.options, paper: job.paper, copies })
        await withPrintDeadline(runProcess(sumatra, args), 90000, 'SPOOL_FAILED', `SumatraPDF 送打超时（90s）`)
        return {
          archivedPdfPath: pdfPath,
          detail: { via: 'SumatraPDF', settings: sumatraPrintSettings(job.options, job.paper, copies), args },
        }
      }
      // 未打包 SumatraPDF：退回 Chromium PDF 插件窗口打印（无需外部依赖）
      await this.windows.runExclusive('pdf', async (win) => {
        await win.loadFile(pdfPath)
        await win.webContents.executeJavaScript(
          'document.readyState === "complete" ? true : new Promise(r => window.addEventListener("load", () => r(true)))',
        )
        const opts: Electron.WebContentsPrintOptions = {
          silent: job.options.silent !== false,
          deviceName: printer.id,
          copies,
          printBackground: true,
        }
        if (job.options.duplex) { opts.duplexMode = duplexMode(job.options.duplex) }
        const ranges = parsePageRanges(job.options.pages)
        if (ranges) { opts.pageRanges = ranges }
        await webContentsPrint(win.webContents, opts)
      })
      return { archivedPdfPath: pdfPath, detail: { via: 'chromium-pdf-plugin' } }
    }

    // macOS / Linux（含国产化 OS）：CUPS lp（纸盒 InputSlot 为 CUPS 通用约定，具体名依驱动）
    const args = buildLpArgs({ printerId: printer.id, pdfPath, jobName: job.jobName, options: job.options, paper: job.paper, copies })
    await withPrintDeadline(runProcess('lp', args), 90000, 'SPOOL_FAILED', 'lp 送打超时（90s）')
    return { archivedPdfPath: pdfPath, detail: { via: 'cups-lp', args } }
  }
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
        else {
          const failure = classifyProcessFailure(cmd, code, stderr)
          reject(printError(failure.code, failure.message, { cmd, exitCode: code, stderr: stderr.trim() }))
        }
      })
    })
  })
}
