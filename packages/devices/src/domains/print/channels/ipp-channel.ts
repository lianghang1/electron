import type { ChannelId, UnifiedPrinter } from '@shell/shared'
import type { PreparedJob } from './channel-types'
import type { ChannelOutcome, PrintChannel } from './print-channel'
import { printError } from '../errors'

/**
 * IPP（互联网打印协议）通道。
 * 用途：免驱动向支持 IPP 的网络打印机提交任务、查询任务级状态（队列中/打印中/完成）。
 * 实现建议：`ipp` npm 包（纯 JS，纯协议实现），构造 PrintJob 属性包后 SubmitJob。
 * 启用时实现 PrintChannel 并在 PrintService 注册，统一 API 契约零改动。
 */
export class IppChannel implements PrintChannel {
  readonly id: ChannelId = 'ipp'

  async execute(_job: PreparedJob, _printer: UnifiedPrinter): Promise<ChannelOutcome> {
    throw printError('CHANNEL_UNAVAILABLE', 'IPP 通道为预留扩展点，尚未启用')
  }
}
