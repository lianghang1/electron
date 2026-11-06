import type { ChannelId, PaperSpec, PrintOptions, PrintRequest } from '@shell/shared'

/**
 * 归一化后的打印任务：内容已按目标通道的可执行形态准备好。
 * html: 系统队列渲染打印
 * pdf:  现成 PDF 文件直通
 */
export interface PreparedJob {
  jobId: string
  jobName: string
  /** 已归一为物理尺寸；PDF 文件/URL 直通可缺省（版式由 PDF 自身决定） */
  paper?: PaperSpec
  options: PrintOptions
  content: PreparedContent
}

export type PreparedContent
  = | { type: 'html', html: string }
    | { type: 'pdf', path: string }

export type { ChannelId, PrintRequest }
