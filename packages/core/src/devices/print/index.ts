import type { JobStatus, PrinterCaps, PrintLogFn, PrintRequest, PrintResult, UnifiedPrinter } from '@desktop/shared'
import type { BrowserWindow } from 'electron'
import type { Logger } from '../../logger/logger'
import { join } from 'node:path'
import { HiddenWindowPool } from './hidden-window'
import { PrinterRegistry } from './printer-registry'
import { PrintService } from './service'

export * from './paper'

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
  /** 渲染预览：模板 + 数据 + 纸张写法 → 完整 HTML（iframe 实时预览用，不送打） */
  renderPreview: (templateId: string, data: Record<string, unknown>, paper: string) => Promise<string>
  reprint: (jobId: string) => Promise<PrintResult>
  /** 启动清扫：删除超过保留期且无在册任务引用的归档 PDF，返回删除数（createPrintSystem 内自动执行一次） */
  cleanupArchive: () => Promise<number>
  /** app 退出前调用：销毁隐藏渲染窗口 */
  destroy: () => void
}

export interface PrintSystemOptions {
  /** 运行时状态目录（传 userData）：归档 PDF 与任务簿存放处 */
  stateDir: string
  /** SumatraPDF 绝对路径（未传/未就位时 PDF 直通回退 Chromium 窗口） */
  sumatraPath?: string
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
  const registry = new PrinterRegistry(windows)
  const log: PrintLogFn = (level, message, meta) => options.logger?.[level](message, meta)
  const service = new PrintService(windows, registry, {
    archiveDir,
    jobsFile: join(options.stateDir, 'print-jobs.json'),
    sumatraPath: options.sumatraPath,
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
    renderPreview: async (templateId, data, paper) => service.renderPreview(templateId, data, paper),
    reprint: jobId => service.reprint(jobId),
    cleanupArchive: () => service.cleanupArchive(),
    destroy: () => windows.destroyAll(),
  }

  // 启动清扫过期孤儿归档（fire-and-forget；retentionDays=0 关闭）
  void system.cleanupArchive().catch(() => {})

  return system
}
