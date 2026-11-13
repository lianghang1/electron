import type { Logger } from '@shell/kernel/logger'
import type { JobStatus, PrintLogFn, PrintRequest, PrintResult, UnifiedPrinter } from '@shell/shared'
import type { BrowserWindow } from 'electron'
import type { DeviceHost } from '../../host/device-host'
import { HiddenWindowPool } from './hidden-window'
import { mergePrintDefaults } from './print-defaults'
import { PrinterRegistry } from './printer-registry'
import { PrintService } from './service'

export * from './paper'

/** 打印系统句柄：平台与打印模块的唯一交互面 */
export interface PrintSystem {
  submitPrintJob: (request: PrintRequest) => Promise<PrintResult>
  listDevices: () => Promise<UnifiedPrinter[]>
  getJobStatus: (jobId: string) => Promise<JobStatus | null>
  /** 最近任务列表（创建时间倒序），任务中心数据源 */
  listPrintJobs: (limit?: number) => Promise<JobStatus[]>
  /** 删除单条任务记录（连带删除其归档 PDF） */
  removePrintJob: (jobId: string) => Promise<boolean>
  /** 清空全部任务记录（连带删除归档 PDF），返回清除条数 */
  clearPrintJobs: () => Promise<number>
  reprintJob: (jobId: string) => Promise<PrintResult>
  /** 启动清扫：删除超过保留期且无在册任务引用的归档 PDF，返回删除数（createPrintSystem 内自动执行一次） */
  cleanupArchive: () => Promise<number>
  /** app 退出前调用：销毁隐藏渲染窗口 */
  destroy: () => void
}

export interface PrintSystemOptions {
  /** 任务簿文件绝对路径（任务历史持久化，统一根目录的 storage/ 下） */
  jobsFile: string
  /** 归档 PDF 目录绝对路径（统一根目录的 files/ 下） */
  archiveDir: string
  /** SumatraPDF 绝对路径（未传/未就位时 PDF 直通回退 Chromium 窗口） */
  sumatraPath?: string
  /** 主窗口引用：打印隐藏窗挂 parent，主窗销毁时级联销毁（无主隐藏窗会让 window-all-closed 永不触发，进程常驻） */
  getParent?: () => BrowserWindow | undefined
  /** 设备守护进程：winspool 同步探测经此进 utility 进程，避免阻塞主进程事件循环 */
  host?: DeviceHost
  /** 打印 URL 负载允许的源站；空 = 拒绝远程下载 */
  allowedOrigins?: readonly string[]
  /** 现场追加源站读取器（设备配置 urlOrigins 覆盖项，每次提交时读取） */
  siteOrigins?: () => readonly string[]
  /** 结构化日志（模块内不直接 console） */
  logger?: Logger
  /** 现场默认打印参数：请求未显式给出的字段由配置中心补齐 */
  defaultOptions?: () => Record<string, unknown>
}

/**
 * 创建打印系统（print 域通道由 core/src/ipc/print.ts 注册）。宿主 app 退出前调 destroy()。
 */
export function createPrintSystem(options: PrintSystemOptions): PrintSystem {
  const windows = new HiddenWindowPool(options.getParent)
  const registry = new PrinterRegistry(windows, options.host)
  const log: PrintLogFn = (level, message, meta) => options.logger?.[level](message, meta)
  const service = new PrintService(windows, registry, {
    archiveDir: options.archiveDir,
    jobsFile: options.jobsFile,
    sumatraPath: options.sumatraPath,
    allowedOrigins: options.allowedOrigins ?? [],
    siteOrigins: options.siteOrigins,
    logger: log,
  })

  const system: PrintSystem = {
    submitPrintJob: request => service.submitPrintJob(mergePrintDefaults(request, options.defaultOptions?.())),
    listDevices: () => registry.list(),
    getJobStatus: jobId => service.getJobStatus(jobId),
    listPrintJobs: async limit => service.listPrintJobs(limit),
    removePrintJob: jobId => service.removePrintJob(jobId),
    clearPrintJobs: () => service.clearPrintJobs(),
    reprintJob: jobId => service.reprintJob(jobId),
    cleanupArchive: () => service.cleanupArchive(),
    destroy: () => windows.destroyAll(),
  }

  // 启动清扫过期孤儿归档（fire-and-forget；retentionDays=0 关闭）
  void system.cleanupArchive().catch(() => {})

  return system
}
