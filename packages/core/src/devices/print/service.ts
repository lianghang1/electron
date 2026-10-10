import type { JobStatus, PaperSpec, PrinterCaps, PrintLogFn, PrintOptions, PrintPreset, PrintRequest, PrintResult, RawPrinterConfig, UnifiedPrinter } from '@desktop/shared'
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
import { mergePresets } from './preset'
import { IMAGE_MIME, renderImageViewerHtml, renderTemplateHtml } from './templates'

/**
 * PrintService = 统一打印 API 的实现体（归一化层）。
 * 渲染进程/业务层唯一可见的打印入口；所有平台与通道差异在这里消化：
 *   submit(request) → 校验 → 解析打印机 → 内容归一 → 通道路由 → 执行 → 结果统一化
 */
export class PrintService {
  private readonly jobs: JobStore
  private readonly channels: Map<string, PrintChannel>
  private presets: PrintPreset[]
  /** 网络直连打印机档案（与 PrinterRegistry 同一数组实例，原地变更即时生效） */
  private readonly printers: RawPrinterConfig[]
  /** 可选日志注入（PII 域外的打印数据可记录） */
  private readonly logger: PrintLogFn
  private readonly archiveDir: string
  private readonly persistPresets?: (presets: PrintPreset[]) => void
  private readonly persistPrinters?: (printers: RawPrinterConfig[]) => void

  /** 装配注入的依赖与现场数据（文件路径/打印机/预设），设备层不自行寻址 */
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
      /** 运行时自定义预设（持久化回注，按 id 覆盖出厂） */
      customPresets?: PrintPreset[]
      /** 预设编辑持久化 */
      persistPresets?: (presets: PrintPreset[]) => void
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
    this.persistPresets = deps.persistPresets
    this.presets = mergePresets(deps.customPresets)
    this.printers = deps.printers
    this.persistPrinters = deps.persistPrinters
    this.channels = new Map<string, PrintChannel>([
      ['system', new SystemChannel(windows, deps.archiveDir, deps.sumatraPath)],
      ['raw', new RawChannel()],
      ['ipp', new IppChannel()],
    ])
  }

  /** 打印预设库：出厂预设 + 持久化回注的运行时自定义 */
  listPresets(): PrintPreset[] {
    return this.presets.slice()
  }

  upsertPreset(preset: PrintPreset): void {
    if (!preset?.id || !preset.displayName || !preset.businessType) {
      throw printError('VALIDATION_FAILED', '打印预设缺少 id/displayName/businessType')
    }
    const list = this.presets.slice()
    const i = list.findIndex(p => p.id === preset.id)
    if (i >= 0)
      list[i] = preset
    else list.push(preset)
    this.presets = list
    this.persistPresets?.(list)
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

  /** 按预设一键打印：调用方只提供业务数据（失败抛 PrintError，与 submit 一致） */
  async submitByPreset(presetId: string, data: Record<string, unknown>): Promise<PrintResult> {
    const preset = this.presets.find(p => p.id === presetId)
    if (!preset) {
      throw printError('VALIDATION_FAILED', `未知打印预设: ${presetId}`, { available: this.presets.map(p => p.id) })
    }
    if (!preset.templateId) {
      throw printError('VALIDATION_FAILED', `预设 ${presetId} 未绑定模板，无法注入数据`)
    }
    const request: PrintRequest = {
      businessType: preset.businessType,
      payload: { kind: 'template', templateId: preset.templateId, data },
      options: {
        paper: preset.paper,
        printerId: preset.printerId,
        copies: preset.copies,
        silent: preset.silent,
        channel: preset.channel,
        duplex: preset.duplex,
        pages: preset.pages,
        grayscale: preset.grayscale,
        landscape: preset.landscape,
        hardware: preset.hardware,
        jobName: preset.displayName,
      },
    }
    return this.submit(request)
  }

  async submit(req: PrintRequest): Promise<PrintResult> {
    const jobId = randomUUID()
    const jobName = req?.options?.jobName?.trim() || `${req?.businessType ?? 'print'}-${Date.now()}`
    // 先登记任务簿：任何阶段失败（含打印机解析/校验）都有任务可查，status 语义一致
    this.jobs.create(req, jobId, jobName)
    try {
      const printer = await this.registry.resolve(req?.options?.printerId)
      this.validate(req)
      // paper 支持 PaperSpec 对象或纸型库 ID，这里归一为 PaperSpec
      const paper = resolvePaper(req.options.paper)
      assertPaperSupported(paper, printer.capabilities.maxWidthMm, printer.id)
      const channel = this.pickChannel(req, printer)
      this.jobs.markPrinting(jobId)
      const startedAt = Date.now()
      this.log('info', `提交打印任务 ${jobName}`, {
        jobId,
        businessType: req.businessType,
        channel: channel.id,
        printerId: printer.id,
      })

      const job: PreparedJob = {
        jobId,
        jobName,
        businessType: req.businessType,
        paper,
        options: req.options,
        content: await this.normalizeContent(req, paper),
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

  /** 渲染预览：模板 + 数据 + 纸张 → 完整 HTML（供渲染进程 iframe 实时预览，不送打） */
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
        businessType: rec.request.businessType,
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

    const receiptLike = req.businessType === 'receipt' || req.businessType === 'label'
    if (receiptLike && printer.source === 'network') {
      return this.channels.get('raw')!
    }
    if (printer.source === 'network') {
      throw printError(
        'OPTION_UNSUPPORTED',
        '选中的网络直连打印机不支持文档/图片/PDF 打印，请在打印机列表中选择系统打印机（或配置 IPP 通道）',
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

  /** 内容归一：四种负载 → 通道可执行形态（HTML / PDF / 指令流）。paper 已归一为 PaperSpec */
  private async normalizeContent(req: PrintRequest, paper: PaperSpec): Promise<PreparedContent> {
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
        const ext = extname(p.path).toLowerCase()
        if (ext === '.pdf') {
          // PDF 版式由文件自身页面决定，options.paper 不作用于 PDF 直通
          return { type: 'pdf', path: p.path }
        }
        const mime = IMAGE_MIME[ext]
        if (mime) {
          const dataUrl = `data:${mime};base64,${readFileSync(p.path).toString('base64')}`
          const html = renderImageViewerHtml(dataUrl, paper)
          return { type: 'html', html }
        }
        throw printError('VALIDATION_FAILED', `不支持的文件类型: ${ext}（支持 PDF 与常见图片格式）`)
      }
      case 'raw':
        return { type: 'raw', bytes: p.bytes, dialect: p.dialect }
    }
  }

  private validate(req: PrintRequest): void {
    if (!req || typeof req !== 'object') {
      throw printError('VALIDATION_FAILED', '无效的打印请求')
    }
    if (!req.payload?.kind) {
      throw printError('VALIDATION_FAILED', '缺少 payload（打印内容）')
    }
    // PDF 文件直通按 PDF 自身页面尺寸打印，不依赖纸张规格；其余内容必须显式指定
    const isPdfPassthrough = req.businessType === 'pdf' && req.payload.kind === 'file'
    if (!isPdfPassthrough && !req.options?.paper) {
      throw printError('VALIDATION_FAILED', '缺少 options.paper（纸张规格）')
    }
  }
}
