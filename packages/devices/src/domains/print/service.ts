import type { JobStatus, PaperSpec, PrintLogFn, PrintRequest, PrintResult, UnifiedPrinter } from '@shell/shared'
import type { TaskQueue } from '../../runtime/queue'
import type { PreparedContent, PreparedJob } from './channels/prepared-job'
import type { PrintChannel } from './channels/print-channel'
import type { PrintChannelRegistry } from './channels/print-channel-registry'
import type { HiddenWindowPool } from './hidden-window'
import type { PrinterRegistry } from './printer-registry'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { createTaskQueue } from '../../runtime/queue'
import { cleanupArchiveDir } from './archive-cleanup'
import { buildPrintChannels } from './channels/build-print-channels'
import { channelMode, resolveChannelPreference } from './channels/channel-selection'
import { createPrintChannelRegistry } from './channels/print-channel-registry'
import { printError, toPrintError } from './errors'
import { JobStore } from './job-store'
import { assertPaperSupported, resolvePaper } from './paper'
import { preparePrintContent } from './prepare-print-content'
import { virtualPrinter } from './printer-name'

const PREPARE_CONCURRENCY = 4
const SPOOL_CONCURRENCY = 1
const STUCK_THRESHOLD_MS = 120_000

/**
 * PrintService = 统一打印 API 的实现体（归一化层）。
 * 渲染进程/业务层唯一可见的打印入口；所有平台与通道差异在这里消化：
 *   submit(request) → 通道路由 → 解析打印机 → 校验 → 内容准备队列 → 送打队列 → 结果统一化
 */
export class PrintService {
  private readonly jobs: JobStore
  private readonly channels: PrintChannelRegistry
  private readonly prepareQueue: TaskQueue
  private readonly spoolQueue: TaskQueue
  /** 可选日志注入（PII 域外的打印数据可记录） */
  private readonly logger: PrintLogFn
  private readonly archiveDir: string
  private readonly allowedOrigins: readonly string[]

  /** 装配注入的依赖与现场数据（文件路径/打印机），设备层不自行寻址 */
  constructor(
    private readonly windows: HiddenWindowPool,
    private readonly registry: PrinterRegistry,
    deps: {
      /** 归档 PDF 目录（平台统一根目录 files/print/） */
      archiveDir: string
      /** 任务簿文件（平台统一根目录 storage/print-jobs.json） */
      jobsFile: string
      /** SumatraPDF 路径（资源根解析；缺省禁用 PDF 直通通道回退） */
      sumatraPath?: string
      /** 打印 URL 负载允许的源站；空 = 拒绝远程下载 */
      allowedOrigins?: readonly string[]
      logger?: PrintLogFn
    },
  ) {
    this.logger = deps.logger ?? (() => {})
    this.archiveDir = deps.archiveDir
    this.allowedOrigins = deps.allowedOrigins ?? []
    this.jobs = new JobStore(deps.jobsFile)
    this.channels = createPrintChannelRegistry()
    for (const channel of buildPrintChannels({
      windows,
      archiveDir: deps.archiveDir,
      sumatraPath: deps.sumatraPath,
    })) {
      this.channels.register(channel)
    }
    this.prepareQueue = createTaskQueue(PREPARE_CONCURRENCY)
    this.spoolQueue = createTaskQueue(SPOOL_CONCURRENCY)
  }

  async submit(req: PrintRequest): Promise<PrintResult> {
    const jobId = randomUUID()
    const jobName = req?.options?.jobName?.trim() || `${req?.payload?.kind ?? 'print'}-${Date.now()}`
    // 先登记任务簿：任何阶段失败（含通道路由/打印机解析/校验）都有任务可查，status 语义一致
    this.jobs.create(req, jobId, jobName)
    try {
      const channel = this.pickChannel(req)
      const printer = await this.resolvePrinter(channel, req?.options?.printerId)
      this.validate(req)
      // 纸张归一：字符串便捷写法（'a4'/'80x60'…）→ 物理尺寸，识别不了 → undefined 交驱动默认；PDF 直通豁免纸型
      const paper = req.options.paper ? resolvePaper(req.options.paper) : undefined
      if (paper) { assertPaperSupported(paper, printer.capabilities.maxWidthMm, printer.id) }
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
        content: await this.prepareQueue.enqueue(() =>
          Promise.resolve(this.preparePrintContent(req, paper, jobId))),
      }

      const outcome = await this.spoolQueue.enqueue(() => channel.execute(job, printer))
      const result: PrintResult = {
        jobId,
        channel: channel.id,
        printerId: printer.id,
        meta: req.options.meta,
        archivedPdfPath: outcome.archivedPdfPath,
        detail: outcome.detail,
        mode: channelMode(channel.id),
        remoteJob: outcome.remoteJob,
      }
      if (outcome.remoteJob) { this.jobs.markRemoteState(jobId, outcome.remoteJob.state) }
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

  /** 查询任务状态；任务不存在返回 null。顺带检出卡住任务并回读通道级状态。 */
  async status(jobId: string): Promise<JobStatus | null> {
    this.jobs.detectStuck(STUCK_THRESHOLD_MS)
    const current = this.jobs.status(jobId)
    if (!current) { return null }
    const rec = this.jobs.get(jobId)
    const channel = rec?.result?.channel ? this.channels.get(rec.result.channel) : undefined
    if (channel?.pollStatus && rec?.result) {
      const remote = await channel.pollStatus(rec.result)
      if (remote) {
        this.jobs.markRemoteState(jobId, remote.state)
        return { ...current, remoteState: remote.state }
      }
    }
    return current
  }

  /** 最近任务列表（任务中心数据源），创建时间倒序 */
  listJobs(limit = 50): JobStatus[] {
    this.jobs.detectStuck(STUCK_THRESHOLD_MS)
    return this.jobs.list(limit)
  }

  /** 启动清扫：删除超过保留期且无在册任务引用的归档 PDF，返回删除数；retentionDays=0 关闭 */
  async cleanupArchive(retentionDays = 30): Promise<number> {
    const removed = await cleanupArchiveDir(this.archiveDir, this.jobs.referencedArchiveFiles(), retentionDays)
    if (removed.length > 0) { this.log('info', `归档清扫：删除 ${removed.length} 个过期孤儿 PDF`, { files: removed }) }
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

  /** 统一打印机列表（系统 + 网络直连合并） */
  listPrinters(): Promise<UnifiedPrinter[]> {
    return this.registry.list()
  }

  /** 重打：优先用 PDF 存档（版式完全一致，保持原通道）；文件负载任务原样重提交 */
  async reprint(jobId: string): Promise<PrintResult> {
    const rec = this.jobs.get(jobId)
    if (!rec) {
      throw printError('VALIDATION_FAILED', `任务不存在: ${jobId}`)
    }
    const p = rec.request.payload
    const archived = rec.result?.archivedPdfPath
    if (p.kind === 'html' && archived && existsSync(archived)) {
      return this.submit({
        payload: { kind: 'file', path: archived },
        options: {
          ...rec.request.options,
          channel: rec.result?.channel ?? rec.request.options.channel,
        },
      })
    }
    return this.submit(rec.request)
  }

  /** 确定性通道路由：显式 channel > preview > dryRun > auto；业务代码零平台/通道分支。 */
  private pickChannel(req: PrintRequest): PrintChannel {
    const pref = resolveChannelPreference(req.options)
    return pref === 'auto' ? this.channels.require('system') : this.channels.require(pref)
  }

  /** 真实送打要求系统打印机就位；无硬件通道有则用真实打印机信息，无则回落虚拟打印机。 */
  private async resolvePrinter(channel: PrintChannel, printerId?: string): Promise<UnifiedPrinter> {
    if (channel.spools) { return this.registry.resolve(printerId) }
    return (await this.registry.resolveOptional(printerId)) ?? virtualPrinter(printerId)
  }

  /** 内容归一委托给策略表：本类零 switch，负载形态差异收敛在 prepare-print-content */
  private preparePrintContent(req: PrintRequest, paper: PaperSpec | undefined, jobId: string): Promise<PreparedContent> | PreparedContent {
    return preparePrintContent(req.payload, {
      archiveDir: this.archiveDir,
      jobId,
      paper,
      log: this.log.bind(this),
      allowedOrigins: this.allowedOrigins,
    })
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
