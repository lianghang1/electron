import type { UrlPayload } from '@shell/shared'
import type { UrlFileType } from './url-type'
import { Buffer } from 'node:buffer'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { assertFetchableUrl, isPrivateHost, matchOriginPattern } from '@shell/shared'
import { net } from 'electron'
import { printError } from './errors'
import { withPrintDeadline } from './operation-deadline'
import { IMAGE_MIME } from './templates'
import { imageExt, typeFromContentType, typeFromUrlPath } from './url-type'

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
 * 下载 URL 负载到归档目录（print/<jobId>.<ext>），复用任务归档生命周期。
 * 类型判定链：fileType 显式提示 > Content-Type > URL 扩展名 > PDF 兜底（记 warn）。
 * 源站白名单 = flavor 基线 ∪ 设备配置现场追加（运行期可在诊断台「设备配置」增删）；
 * 缺省拒绝一切远程下载，杜绝渲染层借打印通道让主进程访问元数据服务（SSRF）。
 * 内网策略：`*` 只放行公网；内网主机必须在白名单中显式列出（显式条目即运维意图）。
 */
export async function downloadUrlContent(
  payload: UrlPayload,
  archiveDir: string,
  jobId: string,
  log: UrlLogFn,
  allowedOrigins: readonly string[] = [],
): Promise<DownloadedUrl> {
  let target: URL
  try {
    target = assertFetchableUrl(payload.url, allowedOrigins)
  }
  catch (err) {
    throw printError('VALIDATION_FAILED', `URL 未通过下载校验: ${String(err)}`)
  }
  const matched = matchOriginPattern(target.href, allowedOrigins)
  if (isPrivateHost(target.hostname) && matched !== undefined) {
    // `*` 通配只代表放行公网；内网主机必须显式列出才放行（防渲染进程借道探测内网）
    if (matched === '*') {
      throw printError('VALIDATION_FAILED', `URL 指向内网地址，公网通配不放行；如需访问请把 ${target.origin} 显式加入白名单`)
    }
    // 显式条目命中内网主机：视为运维意图，放行（防回环探测仍挡 localhost 元数据之外的误配由使用者自担）
    log('warn', 'URL 指向内网主机，因白名单显式列出而放行', { origin: target.origin })
  }

  const res = await withPrintDeadline(
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
