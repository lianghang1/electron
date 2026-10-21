import type { JobStatus, PrintRequest, PrintResult, UnifiedPrinter } from '../../devices/print'
import { invoke } from '../../../domain'

/**
 * print 域契约 —— 统一打印（系统队列 / IPP 预留）。
 * submit / reprint 失败统一 reject（IpcRemoteError，code 见 PrintErrorCode）；
 * 任务历史（含失败原因）经 status / listJobs 查询。
 */
export const printDomainDefs = {
  /** 提交打印任务（统一信封：业务类型 + 负载 + 选项） */
  submit: invoke<(request: PrintRequest) => Promise<PrintResult>>(),
  /** 统一打印机列表（系统队列，含 capabilities 硬件能力位） */
  listPrinters: invoke<() => Promise<UnifiedPrinter[]>>(),
  /** 单条任务状态查询（找不到返回 null） */
  getJob: invoke<(jobId: string) => Promise<JobStatus | null>>(),
  /** 最近任务列表（创建时间倒序），任务中心数据源 */
  listJobs: invoke<(limit?: number) => Promise<JobStatus[]>>(),
  /** 删除单条任务记录（连带删除其归档 PDF） */
  removeJob: invoke<(jobId: string) => Promise<boolean>>(),
  /** 清空全部任务记录（连带删除归档 PDF），返回清除条数 */
  clearJobs: invoke<() => Promise<number>>(),
  /** 重打：优先用 PDF 存档（版式一致），文件负载任务原样重提交 */
  reprint: invoke<(jobId: string) => Promise<PrintResult>>(),
}
