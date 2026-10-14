import type { JobStatus, PrinterCaps, PrintRequest, PrintResult, RawPrinterConfig, UnifiedPrinter } from '../../devices/print'
import { invoke } from '../../../domain'

/**
 * print 域契约 —— 统一打印（系统队列 / 指令直写 / IPP 预留）。
 * submit / reprint 失败统一 reject（IpcRemoteError，code 见 PrintErrorCode）；
 * 任务历史（含失败原因）经 status / listJobs 查询。
 */
export const printDomainDefs = {
  /** 提交打印任务（统一信封：业务类型 + 负载 + 选项） */
  submit: invoke<(request: PrintRequest) => Promise<PrintResult>>(),
  /** 统一打印机列表（系统 + 网络直连合并） */
  listPrinters: invoke<() => Promise<UnifiedPrinter[]>>(),
  /** 打印机能力探测（决定硬件控制参数是否可用） */
  capabilities: invoke<(printerId: string) => Promise<PrinterCaps>>(),
  /** 查询任务状态 */
  status: invoke<(jobId: string) => Promise<JobStatus | { jobId: string, state: 'unknown' }>>(),
  /** 最近任务列表（创建时间倒序），任务中心数据源 */
  listJobs: invoke<(limit?: number) => Promise<JobStatus[]>>(),
  /** 删除单条任务记录（连带删除其归档 PDF） */
  removeJob: invoke<(jobId: string) => Promise<boolean>>(),
  /** 清空全部任务记录（连带删除归档 PDF），返回清除条数 */
  clearJobs: invoke<() => Promise<number>>(),
  /** 渲染预览：模板 + 数据 + 纸张写法 → 完整 HTML（iframe 实时预览用，不送打） */
  renderPreview: invoke<(templateId: string, data: Record<string, unknown>, paper: string) => Promise<string>>(),
  /** 重打：优先用 PDF 存档（版式一致），文件/指令负载任务原样重提交 */
  reprint: invoke<(jobId: string) => Promise<PrintResult>>(),
  /** 网络直连打印机档案列表（运行时编辑数据源） */
  getNetworkPrinters: invoke<() => RawPrinterConfig[]>(),
  /** 运行时编辑网络直连打印机档案（upsert 按 id 覆盖或新增，持久化并即时生效），返回更新后的档案列表 */
  upsertNetworkPrinter: invoke<(printer: RawPrinterConfig) => RawPrinterConfig[]>(),
}
