import type { JobStatus, PaperInput, PaperProfile, PrinterCaps, PrintLogFn, PrintPreset, PrintRequest, PrintResult, RawPrinterConfig, UnifiedPrinter } from '@desktop/shared'
import type { BrowserWindow } from 'electron'
import type { Logger } from '../../logger/logger'
import { join } from 'node:path'
import { HiddenWindowPool } from './hidden-window'
import { getPaperLibrary } from './paper'
import { PrinterRegistry } from './printer-registry'
import { PrintService } from './service'

export * from './paper'
export { BUILT_IN_PRESETS, mergePresets } from './preset'

/** 打印系统句柄：平台与打印模块的唯一交互面 */
export interface PrintSystem {
  submit: (request: PrintRequest) => Promise<PrintResult>
  listPrinters: () => Promise<UnifiedPrinter[]>
  capabilities: (printerId: string) => Promise<PrinterCaps>
  status: (jobId: string) => Promise<JobStatus | { jobId: string, state: 'unknown' }>
  /** 最近任务列表（创建时间倒序），任务中心数据源 */
  listJobs: (limit?: number) => Promise<JobStatus[]>
  /** 删除单条任务记录（连带删除其归档 PDF） */
  removeJob: (jobId: string) => Promise<boolean>
  /** 清空全部任务记录（连带删除归档 PDF），返回清除条数 */
  clearJobs: () => Promise<number>
  /** 纸型库 */
  listPapers: () => Promise<PaperProfile[]>
  /** 打印预设库：业务单据一键打印 */
  listPresets: () => Promise<PrintPreset[]>
  /** 按预设一键打印（调用方只提供业务数据） */
  submitByPreset: (presetId: string, data: Record<string, unknown>) => Promise<PrintResult>
  /** 运行时编辑打印预设（持久化，热生效） */
  savePreset: (preset: PrintPreset) => void
  /** 渲染预览：模板 + 数据 + 纸张 → 完整 HTML（iframe 实时预览用，不送打） */
  renderPreview: (templateId: string, data: Record<string, unknown>, paper: PaperInput) => Promise<string>
  reprint: (jobId: string) => Promise<PrintResult>
  /** 网络直连打印机档案列表（运行时编辑数据源） */
  getNetworkPrinters: () => RawPrinterConfig[]
  /** 运行时编辑网络直连打印机档案（upsert，持久化 + 即时生效），返回更新后的档案列表 */
  upsertNetworkPrinter: (printer: RawPrinterConfig) => RawPrinterConfig[]
  /** 启动清扫：删除超过保留期且无在册任务引用的归档 PDF，返回删除数（createPrintSystem 内自动执行一次） */
  cleanupArchive: () => Promise<number>
  /** app 退出前调用：销毁隐藏渲染窗口 */
  destroy: () => void
}

export interface PrintSystemOptions {
  /** 运行时状态目录（传 userData）：归档 PDF 与任务簿存放处 */
  stateDir: string
  /** 网络直连打印机档案（初始档案：现场数据 IP/端口/协议/mock；运行时编辑可覆盖） */
  printers: RawPrinterConfig[]
  /** SumatraPDF 绝对路径（未传/未就位时 PDF 直通回退 Chromium 窗口） */
  sumatraPath?: string
  /** 运行时自定义预设（持久化回注，按 id 覆盖出厂） */
  customPresets?: PrintPreset[]
  /** 预设编辑持久化 */
  persistPresets?: (presets: PrintPreset[]) => void
  /** 打印机档案运行时编辑持久化（未注入则编辑仅内存生效） */
  persistPrinters?: (printers: RawPrinterConfig[]) => void
  /** 主窗口引用：打印隐藏窗挂 parent，主窗销毁时级联销毁（无主隐藏窗会让 window-all-closed 永不触发，进程常驻） */
  getParent?: () => BrowserWindow | undefined
  /** 结构化日志（模块内不直接 console） */
  logger?: Logger
}

/**
 * 创建打印系统（print 域通道由 core/src/ipc/print.ts 注册）。宿主 app 退出前调 destroy()。
 */
export function createPrintSystem(options: PrintSystemOptions): PrintSystem {
  const windows = new HiddenWindowPool(options.getParent)
  const archiveDir = join(options.stateDir, 'print-archive')
  // registry 与 service 共享同一 printers 数组实例：service 原地 upsert，registry 视图即时生效
  const registry = new PrinterRegistry(windows, options.printers)
  const log: PrintLogFn = (level, message, meta) => options.logger?.[level](message, meta)
  const service = new PrintService(windows, registry, {
    archiveDir,
    jobsFile: join(options.stateDir, 'print-jobs.json'),
    sumatraPath: options.sumatraPath,
    customPresets: options.customPresets,
    persistPresets: options.persistPresets,
    printers: options.printers,
    persistPrinters: options.persistPrinters,
    logger: log,
  })

  const system: PrintSystem = {
    submit: request => service.submit(request),
    listPrinters: () => registry.list(),
    capabilities: printerId => registry.capabilities(printerId),
    status: jobId => service.status(jobId),
    listJobs: async limit => service.listJobs(limit),
    removeJob: jobId => service.removeJob(jobId),
    clearJobs: () => service.clearJobs(),
    listPapers: async () => getPaperLibrary(),
    listPresets: async () => service.listPresets(),
    submitByPreset: (presetId, data) => service.submitByPreset(presetId, data),
    savePreset: preset => service.upsertPreset(preset),
    renderPreview: async (templateId, data, paper) => service.renderPreview(templateId, data, paper),
    reprint: jobId => service.reprint(jobId),
    getNetworkPrinters: () => service.getNetworkPrinters(),
    upsertNetworkPrinter: printer => service.upsertNetworkPrinter(printer),
    cleanupArchive: () => service.cleanupArchive(),
    destroy: () => windows.destroyAll(),
  }

  // 启动清扫过期孤儿归档（fire-and-forget；retentionDays=0 关闭）
  void system.cleanupArchive().catch(() => {})

  return system
}
