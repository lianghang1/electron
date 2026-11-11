import type { ChannelId, PrintRemoteJob, PrintResult, UnifiedPrinter } from '@shell/shared'
import type { PreparedJob } from './prepared-job'

/**
 * 打印通道槽位：一个实现 = 一种送打方式。
 * descriptorId 与 channels/registry.ts 的能力 × 实现 × 平台声明对齐，注册时校验；
 * spools=false 的实现不占用物理打印机，可在无硬件环境跑通完整任务链路。
 */
export interface PrintChannel {
  readonly id: ChannelId
  /** 指向 PRINT_CHANNELS 中的实现声明 id，防止声明与运行时实现漂移 */
  readonly descriptorId: string
  /** 是否真的向设备送打 */
  readonly spools: boolean
  execute: (job: PreparedJob, printer: UnifiedPrinter) => Promise<ChannelOutcome>
  /** 任务级状态回读：异步队列实现可回报排队/打印中/完成，系统队列可缺省 */
  pollStatus?: (result: PrintResult) => Promise<PrintRemoteJob | undefined>
}

export interface ChannelOutcome {
  /** 存档 PDF 路径（重打依据；不送打的实现同样生成，供预览与重打复用） */
  archivedPdfPath?: string
  /** 通道私有审计信息，业务层不读 */
  detail?: unknown
  /** 通道上报的任务级状态 */
  remoteJob?: PrintRemoteJob
}
