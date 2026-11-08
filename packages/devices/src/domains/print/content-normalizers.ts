import type { FilePayload, HtmlPayload, PaperSpec, PrintPayload, UrlPayload } from '@shell/shared'
import type { PreparedContent } from './channels/channel-types'
import type { UrlLogFn } from './url-content'
import { existsSync, readFileSync } from 'node:fs'
import { extname } from 'node:path'
import { printError } from './errors'
import { IMAGE_MIME, renderImageViewerHtml } from './templates'
import { downloadUrlContent } from './url-content'

/**
 * 内容归一化策略表：三类负载（HTML/文件/URL）→ 通道可执行形态（HTML / PDF）。
 * 平台差异与负载形态收敛为数据表，service 零 switch；新增负载类型 = 加表项 + 加 payload 判别联合分支，
 * satisfies 会逼出所有遗漏点（编译器列出必须改的位置，而非 grep 'kind'）。
 */
export interface NormalizeContext {
  archiveDir: string
  jobId: string
  paper: PaperSpec | undefined
  log: UrlLogFn
}

type Normalizer = (payload: never, ctx: NormalizeContext) => Promise<PreparedContent> | PreparedContent

const NORMALIZERS = {
  html: (p: HtmlPayload): PreparedContent => ({ type: 'html', html: p.html }),
  file: (p: FilePayload, ctx: NormalizeContext): PreparedContent => {
    if (!existsSync(p.path)) {
      throw printError('VALIDATION_FAILED', `文件不存在: ${p.path}`)
    }
    return prepareLocalFile(p.path, ctx.paper)
  },
  url: async (p: UrlPayload, ctx: NormalizeContext): Promise<PreparedContent> => {
    const downloaded = await downloadUrlContent(p, ctx.archiveDir, ctx.jobId, ctx.log)
    return prepareLocalFile(downloaded.path, ctx.paper)
  },
} satisfies Record<PrintPayload['kind'], Normalizer>

/** 表驱动分发的唯一收口点：payload 判别联合在此收敛为 never 传入具体策略 */
export function normalizeContent(payload: PrintPayload, ctx: NormalizeContext): Promise<PreparedContent> | PreparedContent {
  return NORMALIZERS[payload.kind](payload as never, ctx)
}

/** 本地文件 → 通道内容：PDF 直通 / 图片转 base64 查看器（file 与 url 负载共用） */
function prepareLocalFile(filePath: string, paper: PaperSpec | undefined): PreparedContent {
  const ext = extname(filePath).toLowerCase()
  if (ext === '.pdf') {
    // PDF 版式由文件自身页面决定，options.paper 不作用于 PDF 直通
    return { type: 'pdf', path: filePath }
  }
  const mime = IMAGE_MIME[ext]
  if (mime) {
    const dataUrl = `data:${mime};base64,${readFileSync(filePath).toString('base64')}`
    return { type: 'html', html: renderImageViewerHtml(dataUrl, paper) }
  }
  throw printError('VALIDATION_FAILED', `不支持的文件类型: ${ext}（支持 PDF 与常见图片格式）`)
}
