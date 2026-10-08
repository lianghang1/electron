import type { ChannelId, PaperSpec, PrintKind, PrintOptions, PrintRequest } from '@desktop/shared'

/**
 * 归一化后的打印任务：内容已按目标通道的可执行形态准备好。
 * html: 系统队列渲染打印（structured 供指令直写通道复用同一业务数据）
 * pdf:  现成 PDF 文件直通
 * raw:  调用方自带指令流（逃生舱）
 */
export interface PreparedJob {
  jobId: string
  jobName: string
  businessType: PrintKind
  paper: PaperSpec
  options: PrintOptions
  content: PreparedContent
}

export type PreparedContent
  = | { type: 'html', html: string, structured?: { templateId: string, data: Record<string, unknown> } }
    | { type: 'pdf', path: string }
    | { type: 'raw', bytes: Uint8Array, dialect: 'escpos' | 'zpl' | 'tspl' }

export type { ChannelId, PrintRequest }
