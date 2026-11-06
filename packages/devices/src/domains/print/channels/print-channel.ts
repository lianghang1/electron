import type { ChannelId, UnifiedPrinter } from '@shell/shared'
import type { PreparedJob } from './channel-types'

/**
 * 通道适配器统一接口。
 * 契约：execute 成功返回审计信息；一切失败抛 PrintErrorImpl（由 PrintService 记入任务簿并向上抛出）。
 * 新增通道（如蓝牙/串口）= 实现本接口并注册进 PrintService，契约零改动。
 */
export interface PrintChannel {
  readonly id: ChannelId
  execute: (job: PreparedJob, printer: UnifiedPrinter) => Promise<ChannelOutcome>
}

export interface ChannelOutcome {
  /** 存档 PDF 路径（重打依据；SystemChannel 必产，RawChannel 无） */
  archivedPdfPath?: string
  /** 通道私有审计信息，业务层不读 */
  detail?: unknown
}
