import type { JobStatus, PaperSpec, PrinterCaps, PrintLogFn, PrintOptions, PrintRequest, PrintResult, RawPrinterConfig, UnifiedPrinter } from '@desktop/shared'
import type { PreparedContent, PreparedJob } from './channels/channel-types'
import type { PrintChannel } from './channels/print-channel'
import type { HiddenWindowPool } from './hidden-window'
import type { PrinterRegistry } from './printer-registry'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { extname } from 'node:path'
import { cleanupArchiveDir } from './archive-cleanup'
import { IppChannel } from './channels/ipp-channel'
import { RawChannel } from './channels/raw-channel'
import { SystemChannel } from './channels/system-channel'
import { printError, toPrintError } from './errors'
import { JobStore } from './job-store'
import { assertPaperSupported, resolvePaper } from './paper'
import { IMAGE_MIME, renderImageViewerHtml, renderTemplateHtml } from './templates'
import { downloadUrlContent } from './url-content'

/**
 * PrintService = 统一打印 API 的实现体（归一化层）。
 * 渲染进程/业务层唯一可见的打印入口；所有平台与通道差异在这里消化：
 *   submit(request) → 校验 → 解析打印机 → 内容归一 → 通道路由 → 执行 → 结果统一化
 */
export class PrintService {
  private readonly jobs: JobStore
  private readonly channels: Map<string, PrintChannel>
  /** 网络直连打印机档案（与 PrinterRegistry 同一数组实例，原地变更即时生效） */
  private readonly printers: RawPrinterConfig[]
  /** 可选日志注入（PII 域外的打印数据可记录） */
  private readonly logger: PrintLogFn
  private readonly archiveDir: string
  private readonly persistPrinters?: (printers: RawPrinterConfig[]) => void

  /** 装配注入的依赖与现场数据（文件路径/打印机），设备层不自行寻址 */
  constructor(
    private readonly windows: HiddenWindowPool,
    private readonly registry: PrinterRegistry,
    deps: {
      /** 归档 PDF 目录（建议 userData/print-archive） */
      archiveDir: string
      /** 任务簿文件（userData/print-jobs.json） */
      jobsFile: string
      /** SumatraPDF 路径（资源根解析；缺省禁用 PDF 直通通道回退） */
      sumatraPath?: string
      /** 网络直连打印机档案（初始档案，与 registry 共享实例） */
      printers: RawPrinterConfig[]
      /** 打印机档案运行时编辑持久化 */
      persistPrinters?: (printers: RawPrinterConfig[]) => void
      logger?: PrintLogFn
    },
  ) {
    this.logger = deps.logger ?? (() => {})
    this.archiveDir = deps.archiveDir
    this.jobs = new JobStore(deps.jobsFile)
    this.printers = deps.printers
    this.persistPrinters = deps.persistPrinters
    this.channels = new Map<string, PrintChannel>([
      ['system', new SystemChannel(windows, deps.archiveDir, deps.sumatraPath)],
      ['raw', new RawChannel()],
      ['ipp', new IppChannel()],
    ])
  }

  /** 网络直连打印机档案列表（运行时编辑数据源） */
  getNetworkPrinters(): RawPrinterConfig[] {
    return this.printers.slice()
  }

  /**
   * 运行时编辑网络直连打印机档案：upsert 按 id 覆盖或新增 → 持久化。
   * 原地变更共享数组（PrinterRegistry 同一实例），listPrinters/submit 无需重建即读到新档案。
   */
  upsertNetworkPrinter(printer: RawPrinterConfig): RawPrinterConfig[] {
    if (!printer?.id || !printer.transport?.host || !printer.transport?.port) {
      throw printError('VALIDATION_FAILED', '打印机档案缺少 id 或 transport.host/port')
    }
    const i = this.printers.findIndex(p => p.id === printer.id)
    if (i >= 0)
      this.printers.splice(i, 1, printer)
    else
      this.printers.push(printer)
    this.persistPrinters?.(this.printers.slice())
    return this.printers.slice()
  }

  async submit(req: PrintRequest): Promise<PrintResult> {
    const jobId = randomUUID()
    const jobName = req?.options?.jobName?.trim() || `${req?.payload?.kind ?? 'print'}-${Date.now()}`
    // 先登记任务簿：任何阶段失败（含打印机解析/校验）都有任务可查，status 语义一致
    this.jobs.create(req, jobId, jobName)
    try {
      const printer = await this.registry.resolve(req?.options?.printerId)
      this.validate(req)
      // 纸张归一：字符串便捷写法（'a4'/'80x60'…）→ 物理尺寸，识别不了 → undefined 交驱动默认；PDF 直通豁免纸型
      const paper = req.options.paper ? resolvePaper(req.options.paper) : undefined
      if (paper)
        assertPaperSupported(paper, printer.capabilities.maxWidthMm, printer.id)
      const channel = this.pickChannel(req, printer)
      this.jobs.markPrinting(jobId)
      const startedAt = Date.now()
      this.log('info', `提交打印任务 ${jobName}`, {
        jobId,
        channel: channel.id,
        printerId: printer.id,
      })

      const job: PreparedJob = {
        jobId,
        jobName,
        paper,
        options: req.options,
        content: await this.normalizeContent(req, paper, jobId),
      }

      const outcome = await channel.execute(job, printer)
      const result: PrintResult = {
        jobId,
        channel: channel.id,
        printerId: printer.id,
        meta: req.options.meta,
        archivedPdfPath: outcome.archivedPdfPath,
        detail: outcome.detail,
      }
      this.jobs.finish(jobId, result)
      this.log('info', `打印任务完成 ${jobName}`, {
        jobId,
        durationMs: Date.now() - startedAt,
      })
      return result
    }
    catch (err) {
      const pe = toPrintError(err)
      this.jobs.fail(jobId, pe.toJSON())
      this.log('warn', `打印任务失败 ${jobName}: ${pe.code} ${pe.message}`, { jobId })
      throw pe
    }
  }

  /** 统一日志出口（装配方注入；模块内不直接 console） */
  private log(level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>): void {
    this.logger(level, `[print] ${message}`, meta)
  }

  async status(jobId: string): Promise<JobStatus | { jobId: string, state: 'unknown' }> {
    return this.jobs.status(jobId) ?? { jobId, state: 'unknown' }
  }

  /** 最近任务列表（任务中心数据源），创建时间倒序 */
  listJobs(limit = 50): JobStatus[] {
    return this.jobs.list(limit)
  }

  /** 启动清扫：删除超过保留期且无在册任务引用的归档 PDF，返回删除数；retentionDays=0 关闭 */
  async cleanupArchive(retentionDays = 30): Promise<number> {
    const removed = await cleanupArchiveDir(this.archiveDir, this.jobs.referencedArchiveFiles(), retentionDays)
    if (removed.length > 0)
      this.log('info', `归档清扫：删除 ${removed.length} 个过期孤儿 PDF`, { files: removed })
    return removed.length
  }

  /** 删除单条任务记录（连带删除归档 PDF） */
  async removeJob(jobId: string): Promise<boolean> {
    return this.jobs.remove(jobId)
  }

  /** 清空全部任务记录（连带删除归档 PDF），返回清除条数 */
  async clearJobs(): Promise<number> {
    return this.jobs.clear()
  }

  /** 渲染预览：模板 + 数据 + 纸张（字符串写法或物理尺寸）→ 完整 HTML（供渲染进程 iframe 实时预览，不送打） */
  async renderPreview(templateId: string, data: Record<string, unknown>, paper: PrintOptions['paper']): Promise<string> {
    return renderTemplateHtml(templateId, data, resolvePaper(paper))
  }

  /** 统一打印机列表（系统 + 网络直连合并） */
  listPrinters(): Promise<UnifiedPrinter[]> {
    return this.registry.list()
  }

  /** 打印机能力探测（决定硬件控制参数是否可用） */
  capabilities(printerId: string): Promise<PrinterCaps> {
    return this.registry.capabilities(printerId)
  }

  /** 重打：优先用 PDF 存档（版式完全一致，保持原通道、剥离指令专有硬件控制）；文件/指令负载任务原样重提交 */
  async reprint(jobId: string): Promise<PrintResult> {
    const rec = this.jobs.get(jobId)
    if (!rec) {
      throw printError('VALIDATION_FAILED', `任务不存在: ${jobId}`)
    }
    const p = rec.request.payload
    const archived = rec.result?.archivedPdfPath
    if ((p.kind === 'template' || p.kind === 'html') && archived && existsSync(archived)) {
      return this.submit({
        payload: { kind: 'file', path: archived },
        options: {
          ...rec.request.options,
          channel: rec.result?.channel ?? rec.request.options.channel,
          hardware: undefined,
        },
      })
    }
    return this.submit(rec.request)
  }

  /** 契约 §5：确定性通道路由。业务代码零平台/通道分支。 */
  private pickChannel(req: PrintRequest, printer: UnifiedPrinter): PrintChannel {
    const pref = req.options.channel ?? 'auto'
    if (pref !== 'auto') {
      const ch = this.channels.get(pref)
      if (!ch)
        throw printError('VALIDATION_FAILED', `未知通道: ${pref}`)
      this.assertChannelCompatible(pref, req, printer)
      return ch
    }

    // 网络直连打印机仅收指令流：模板负载可译成 ESC/POS 指令（模板不支持指令渲染时 raw 通道显式报错），raw 负载原样直发
    if (printer.source === 'network') {
      if (req.payload.kind === 'template' || req.payload.kind === 'raw') {
        return this.channels.get('raw')!
      }
      throw printError(
        'OPTION_UNSUPPORTED',
        '选中的网络直连打印机仅支持模板/指令负载，文档/图片/PDF 打印请在打印机列表中选择系统打印机（或配置 IPP 通道）',
        { printerId: printer.id },
      )
    }
    return this.channels.get('system')!
  }

  private assertChannelCompatible(pref: string, req: PrintRequest, printer: UnifiedPrinter): void {
    if (pref === 'ipp') {
      throw printError('CHANNEL_UNAVAILABLE', 'IPP 通道为预留扩展点，尚未启用')
    }
    if (pref === 'raw') {
      if (printer.source !== 'network') {
        throw printError('VALIDATION_FAILED', 'raw 通道需要网络直连打印机', { printerId: printer.id })
      }
      if (req.payload.kind === 'file' || req.payload.kind === 'html') {
        throw printError('OPTION_UNSUPPORTED', 'raw 通道仅支持 template（指令渲染）或 raw 指令负载')
      }
    }
    if (pref === 'system') {
      if (printer.source !== 'system') {
        throw printError('VALIDATION_FAILED', 'system 通道需要系统已安装驱动的打印机', { printerId: printer.id })
      }
      if (req.payload.kind === 'raw') {
        throw printError('OPTION_UNSUPPORTED', '系统打印队列不支持原始指令负载')
      }
    }
  }

  /** 内容归一：五种负载 → 通道可执行形态（HTML / PDF / 指令流）。paper 为宽松解析结果（undefined = 交驱动默认纸张） */
  private async normalizeContent(req: PrintRequest, paper: PaperSpec | undefined, jobId: string): Promise<PreparedContent> {
    const p = req.payload
    switch (p.kind) {
      case 'template': {
        // 同一份业务数据双形态：HTML 给系统队列，结构化数据给指令直写渲染器
        const html = await renderTemplateHtml(p.templateId, p.data, paper)
        return { type: 'html', html, structured: { templateId: p.templateId, data: p.data } }
      }
      case 'html':
        return { type: 'html', html: p.html }
      case 'file': {
        if (!existsSync(p.path)) {
          throw printError('VALIDATION_FAILED', `文件不存在: ${p.path}`)
        }
        return this.contentFromLocalFile(p.path, paper)
      }
      case 'url': {
        const downloaded = await downloadUrlContent(p, this.archiveDir, jobId, this.log.bind(this))
        return this.contentFromLocalFile(downloaded.path, paper)
      }
      case 'raw':
        return { type: 'raw', bytes: p.bytes, dialect: p.dialect }
    }
  }

  /** 本地文件 → 通道内容：PDF 直通 / 图片转 base64 查看器（file 与 url 负载共用） */
  private contentFromLocalFile(filePath: string, paper: PaperSpec | undefined): PreparedContent {
    const ext = extname(filePath).toLowerCase()
    if (ext === '.pdf') {
      // PDF 版式由文件自身页面决定，options.paper 不作用于 PDF 直通
      return { type: 'pdf', path: filePath }
    }
    const mime = IMAGE_MIME[ext]
    if (mime) {
      const dataUrl = `data:${mime};base64,${readFileSync(filePath).toString('base64')}`
      return { type: 'html', html: renderImageViewerHtml(dataUrl, paper) }
    }
    throw printError('VALIDATION_FAILED', `不支持的文件类型: ${ext}（支持 PDF 与常见图片格式）`)
  }

  private validate(req: PrintRequest): void {
    if (!req || typeof req !== 'object') {
      throw printError('VALIDATION_FAILED', '无效的打印请求')
    }
    if (!req.payload?.kind) {
      throw printError('VALIDATION_FAILED', '缺少 payload（打印内容）')
    }
  }
}
