import type { UrlPayload } from '@desktop/shared'
import type { UrlFileType } from './url-type'
import { Buffer } from 'node:buffer'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { net } from 'electron'
import { printError } from './errors'
import { IMAGE_MIME } from './templates'
import { imageExt, typeFromContentType, typeFromUrlPath } from './url-type'
import { withTimeout } from './with-timeout'

/** URL 内容下载超时 */
const DOWNLOAD_TIMEOUT_MS = 30_000

/** 下载模块日志：仅告警级（内容类型兜底 / 下载失败细节） */
export type UrlLogFn = (level: 'warn' | 'error', message: string, meta?: Record<string, unknown>) => void

export interface DownloadedUrl {
  type: UrlFileType
  /** 下载产物路径（任务归档目录内，重打与保留期清扫自动覆盖该文件） */
  path: string
}

/**
 * 下载 URL 负载到归档目录（print-archive/<jobId>.<ext>），复用任务归档生命周期。
 * 类型判定链：fileType 显式提示 > Content-Type > URL 扩展名 > PDF 兜底（记 warn）。
 */
export async function downloadUrlContent(
  payload: UrlPayload,
  archiveDir: string,
  jobId: string,
  log: UrlLogFn,
): Promise<DownloadedUrl> {
  let target: URL
  try {
    target = new URL(payload.url)
  }
  catch {
    throw printError('VALIDATION_FAILED', `无效的 URL: ${payload.url}`)
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    throw printError('VALIDATION_FAILED', `URL 仅支持 http/https 协议: ${payload.url}`)
  }

  const res = await withTimeout(
    net.fetch(target.href, { headers: { accept: 'application/pdf,image/*,*/*;q=0.8' } }),
    DOWNLOAD_TIMEOUT_MS,
    'RENDER_FAILED',
    `URL 下载超时（${DOWNLOAD_TIMEOUT_MS / 1000}s）`,
  )
  if (!res.ok) {
    throw printError('RENDER_FAILED', `URL 下载失败（HTTP ${res.status}）`, { url: payload.url })
  }
  const contentType = res.headers.get('content-type')

  const byContentType = typeFromContentType(contentType)
  const byUrlPath = typeFromUrlPath(target.href)
  const type: UrlFileType = payload.fileType ?? byContentType ?? byUrlPath ?? 'pdf'
  if (!payload.fileType && !byContentType && !byUrlPath) {
    log('warn', 'URL 内容类型无法识别，按 PDF 处理', { url: payload.url, contentType: contentType ?? '未知' })
  }

  const ext = type === 'pdf' ? '.pdf' : imageExt(contentType, target.href)
  if (!ext) {
    throw printError('VALIDATION_FAILED', `URL 指向的图片格式不受支持: ${contentType ?? '未知类型'}（支持 ${Object.values(IMAGE_MIME).join(' / ')}）`)
  }

  await mkdir(archiveDir, { recursive: true })
  const filePath = path.join(archiveDir, `${jobId}${ext}`)
  await writeFile(filePath, Buffer.from(await res.arrayBuffer()))
  return { type, path: filePath }
}
