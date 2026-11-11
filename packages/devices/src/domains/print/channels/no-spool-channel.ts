import type { UnifiedPrinter } from '@shell/shared'
import type { PreparedJob } from './prepared-job'
import type { ChannelOutcome, PrintChannel } from './print-channel'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

export type NoSpoolMode = 'simulated' | 'preview' | 'dry-run'

/** HTML 内容转 PDF 存档的注入口：由组合根用隐藏窗口池实现，便于无设备环境注入桩。 */
export interface HtmlPdfRenderer {
  render: (html: string, job: PreparedJob) => Promise<string>
}

/**
 * 无硬件通道：预览出 PDF、干跑算参数、仿真送打三种方式共用一套内容归一与归档逻辑。
 * 三种方式都不占用物理打印机，便于无设备环境下的全链路验证与演示。
 */
export class NoSpoolChannel implements PrintChannel {
  readonly spools = false
  readonly descriptorId: string

  constructor(
    readonly id: NoSpoolMode,
    private readonly renderer: HtmlPdfRenderer,
    private readonly archiveDir: string,
  ) {
    this.descriptorId = id
  }

  async execute(job: PreparedJob, printer: UnifiedPrinter): Promise<ChannelOutcome> {
    const archivedPdfPath = await this.archivePdf(job)
    const detail = this.buildDetail(job, printer, archivedPdfPath)
    const auditFile = this.id === 'simulated'
      ? await this.writeAudit(job, printer, archivedPdfPath, detail)
      : undefined
    return {
      archivedPdfPath,
      detail: auditFile ? { ...detail, auditFile } : detail,
      remoteJob: this.id === 'simulated'
        ? { state: 'done', remoteJobId: job.jobId }
        : undefined,
    }
  }

  private async archivePdf(job: PreparedJob): Promise<string> {
    await mkdir(this.archiveDir, { recursive: true })
    const target = path.join(this.archiveDir, `${job.jobId}.pdf`)
    if (job.content.type === 'pdf') {
      if (path.resolve(job.content.path) !== path.resolve(target)) {
        await copyFile(job.content.path, target)
      }
      return target
    }
    return this.renderer.render(job.content.html, job)
  }

  private buildDetail(job: PreparedJob, printer: UnifiedPrinter, archivedPdfPath: string): Record<string, unknown> {
    const base = {
      mode: this.id,
      printerId: printer.id,
      canonicalName: printer.canonicalName,
      paper: job.paper,
      copies: Math.max(1, job.options.copies ?? 1),
      silent: job.options.silent !== false,
      jobName: job.jobName,
      archivedPdfPath,
    }
    if (this.id === 'dry-run') {
      return {
        ...base,
        willSpool: false,
        spoolPlan: {
          targetChannel: 'system',
          printerId: printer.id,
          printerSource: printer.source,
          contentType: job.content.type,
          paper: job.paper,
          options: job.options,
        },
      }
    }
    return base
  }

  private async writeAudit(
    job: PreparedJob,
    printer: UnifiedPrinter,
    archivedPdfPath: string,
    detail: Record<string, unknown>,
  ): Promise<string> {
    const auditFile = path.join(this.archiveDir, `${job.jobId}.simulated.json`)
    await writeFile(auditFile, JSON.stringify({
      jobId: job.jobId,
      printedAt: new Date().toISOString(),
      printer: { id: printer.id, canonicalName: printer.canonicalName, source: printer.source },
      content: job.content.type === 'html'
        ? { type: 'html', length: job.content.html.length }
        : { type: 'pdf', sourcePath: job.content.path },
      archivedPdfPath,
      detail,
    }, null, 2), 'utf8')
    return auditFile
  }
}
