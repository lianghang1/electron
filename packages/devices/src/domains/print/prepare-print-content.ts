import type { PaperSpec, PrintPayload, PrintRasterizeOptions } from '@shell/shared'
import type { PreparedContent } from './channels/prepared-job'
import type { RasterizeConfig } from './rasterize/contract'
import type { UrlLogFn } from './url-content'
import { existsSync, readFileSync, writeFile } from 'node:fs'
import { extname } from 'node:path'
import { promisify } from 'node:util'
import { copySourceIntoArchive } from './archive-source'
import { printError } from './errors'
import { assertRasterizeConfig } from './rasterize/contract'
import { IMAGE_MIME, renderImageViewerHtml } from './templates'
import { downloadUrlContent } from './url-content'

const writeFileAsync = promisify(writeFile)

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
  /** PDF 栅格化参数（options.rasterize）；非 PDF 负载忽略 */
  rasterize?: PrintRasterizeOptions
  /** 栅格化执行器（RasterizeWorker.toPdf）；未装配时显式传 rasterize 会拒绝 */
  rasterizeToPdf?: (bytes: Uint8Array, config: RasterizeConfig) => Promise<Uint8Array>
}

export function preparePrintContent(payload: PrintPayload, ctx: PrintContentContext): Promise<PreparedContent> | PreparedContent {
  switch (payload.kind) {
    case 'html':
      return { type: 'html', html: payload.html }
    case 'file': {
      if (!existsSync(payload.path)) {
        throw printError('VALIDATION_FAILED', `文件不存在: ${payload.path}`)
      }
      // 送打、存档、重打、删除一律面向归档副本：业务源文件不允许被任务簿生命周期改写
      const archived = copySourceIntoArchive(payload.path, ctx.archiveDir, ctx.jobId)
      return prepareLocalFile(archived, ctx.paper, ctx.rasterize, ctx.rasterizeToPdf)
    }
    case 'url':
      return downloadUrlContent(payload, ctx.archiveDir, ctx.jobId, ctx.log, ctx.allowedOrigins)
        .then(downloaded => prepareLocalFile(downloaded.path, ctx.paper, ctx.rasterize, ctx.rasterizeToPdf))
  }
}

/** 本地文件 → 通道内容：PDF 直通（可选栅格化）/ 图片转 base64 查看器（file 与 url 负载共用） */
async function prepareLocalFile(
  filePath: string,
  paper: PaperSpec | undefined,
  rasterize: PrintRasterizeOptions | undefined,
  rasterizeToPdf: PrintContentContext['rasterizeToPdf'],
): Promise<PreparedContent> {
  const ext = extname(filePath).toLowerCase()
  if (ext === '.pdf') {
    if (rasterize == null) {
      // PDF 版式由文件自身页面决定，options.paper 不作用于 PDF 直通
      return { type: 'pdf', path: filePath }
    }
    if (rasterizeToPdf == null) {
      throw printError('CHANNEL_UNAVAILABLE', '栅格化未启用：当前装配未提供 rasterize worker 入口')
    }
    // 栅格化产物覆盖归档副本：archivedPdfPath/清扫/重打引用同一文件，下游零改动；
    // 先读后写，栅格化失败时归档副本保持完好
    const pdf = await rasterizeToPdf(readFileSync(filePath), assertRasterizeConfig(rasterize))
    await writeFileAsync(filePath, pdf)
    return { type: 'pdf', path: filePath }
  }
  const mime = IMAGE_MIME[ext]
  if (mime) {
    const dataUrl = `data:${mime};base64,${readFileSync(filePath).toString('base64')}`
    return { type: 'html', html: renderImageViewerHtml(dataUrl, paper) }
  }
  throw printError('VALIDATION_FAILED', `不支持的文件类型: ${ext}（支持 PDF 与常见图片格式）`)
}
