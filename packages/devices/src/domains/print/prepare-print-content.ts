import type { PaperSpec, PrintPayload } from '@shell/shared'
import type { PreparedContent } from './channels/prepared-job'
import type { UrlLogFn } from './url-content'
import { existsSync, readFileSync } from 'node:fs'
import { extname } from 'node:path'
import { printError } from './errors'
import { IMAGE_MIME, renderImageViewerHtml } from './templates'
import { downloadUrlContent } from './url-content'

/**
 * 内容归一化：三类负载（HTML/文件/URL）→ 通道可执行形态（HTML / PDF）。
 * 用判别联合的分派函数按 kind 收窄后调用，参数类型由编译器逐支检查。
 */
export interface PrintContentContext {
  archiveDir: string
  jobId: string
  paper: PaperSpec | undefined
  log: UrlLogFn
  /** 远程下载允许的源站（组合根注入）；空 = 拒绝 URL 负载 */
  allowedOrigins: readonly string[]
}

export function preparePrintContent(payload: PrintPayload, ctx: PrintContentContext): Promise<PreparedContent> | PreparedContent {
  switch (payload.kind) {
    case 'html':
      return { type: 'html', html: payload.html }
    case 'file': {
      if (!existsSync(payload.path)) {
        throw printError('VALIDATION_FAILED', `文件不存在: ${payload.path}`)
      }
      return prepareLocalFile(payload.path, ctx.paper)
    }
    case 'url':
      return downloadUrlContent(payload, ctx.archiveDir, ctx.jobId, ctx.log, ctx.allowedOrigins)
        .then(downloaded => prepareLocalFile(downloaded.path, ctx.paper))
  }
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
