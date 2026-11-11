import type { PrintRemoteJob, PrintResult, UnifiedPrinter } from '@shell/shared'
import type { PreparedJob } from './prepared-job'
import type { ChannelOutcome, PrintChannel } from './print-channel'
import { printError } from '../errors'

/**
 * IPP 通道：面向支持互联网打印协议的网络打印机，提交任务并回读队列状态。
 * 接入 IPP 协议实现后在本类内补齐 execute 与 pollStatus，统一打印契约不变。
 */
export class IppChannel implements PrintChannel {
  readonly id = 'ipp' as const
  readonly descriptorId = 'ipp'
  /** 网络打印机由通道自身寻址，不依赖本机已安装驱动的打印机 */
  readonly spools = false

  async execute(_job: PreparedJob, _printer: UnifiedPrinter): Promise<ChannelOutcome> {
    throw printError('CHANNEL_UNAVAILABLE', 'IPP 通道尚未接入网络打印机')
  }

  async pollStatus(_result: PrintResult): Promise<PrintRemoteJob | undefined> {
    return undefined
  }
}
