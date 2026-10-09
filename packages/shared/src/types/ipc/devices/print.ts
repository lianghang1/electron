import type { JobStatus, PaperInput, PaperProfile, PrinterCaps, PrintPreset, PrintRequest, PrintResult, RawPrinterConfig, UnifiedPrinter } from '../../devices/print'
import { invoke } from '../../../domain'

/**
 * print 域契约 —— 统一打印（系统队列 / 指令直写 / IPP 预留）。
 * submit 永不 reject，失败以 PrintResult.error 字段回传。
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
  /** 纸型库 */
  listPapers: invoke<() => Promise<PaperProfile[]>>(),
  /** 打印预设库：业务单据一键打印 */
  listPresets: invoke<() => Promise<PrintPreset[]>>(),
  /** 按预设一键打印（调用方只提供业务数据） */
  submitByPreset: invoke<(presetId: string, data: Record<string, unknown>) => Promise<PrintResult>>(),
  /** 运行时编辑打印预设（持久化，热生效） */
  savePreset: invoke<(preset: PrintPreset) => void>(),
  /** 渲染预览：模板 + 数据 + 纸张 → 完整 HTML（iframe 实时预览用，不送打） */
  renderPreview: invoke<(templateId: string, data: Record<string, unknown>, paper: PaperInput) => Promise<string>>(),
  /** 重打：优先用 PDF 存档（版式一致），文件/指令负载任务原样重提交 */
  reprint: invoke<(jobId: string) => Promise<PrintResult>>(),
  /** 网络直连打印机档案列表（运行时编辑数据源） */
  getNetworkPrinters: invoke<() => RawPrinterConfig[]>(),
  /** 运行时编辑网络直连打印机档案（upsert 按 id 覆盖或新增，持久化并即时生效），返回更新后的档案列表 */
  upsertNetworkPrinter: invoke<(printer: RawPrinterConfig) => RawPrinterConfig[]>(),
}
