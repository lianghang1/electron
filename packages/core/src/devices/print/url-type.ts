import path from 'node:path'
import { IMAGE_MIME } from './templates'

/** URL 负载归一后的内容类型 */
export type UrlFileType = 'pdf' | 'image'

/** Content-Type → 内容类型（application/pdf / IMAGE_MIME 认可的图片类型） */
export function typeFromContentType(contentType: string | null | undefined): UrlFileType | null {
  const mime = contentType?.split(';')[0]?.trim().toLowerCase()
  if (!mime)
    return null
  if (mime === 'application/pdf')
    return 'pdf'
  if (Object.values(IMAGE_MIME).includes(mime))
    return 'image'
  return null
}

/** URL 路径扩展名 → 内容类型（扩展名约定与 file 负载同源） */
export function typeFromUrlPath(url: string): UrlFileType | null {
  try {
    const ext = path.extname(new URL(url).pathname).toLowerCase()
    if (ext === '.pdf')
      return 'pdf'
    if (IMAGE_MIME[ext])
      return 'image'
  }
  catch {
    /* 非法 URL 交由下载阶段报错 */
  }
  return null
}

/** Content-Type / URL → IMAGE_MIME 认可的图片扩展名（落盘扩展名决定后续 base64 的 MIME 识别） */
export function imageExt(contentType: string | null | undefined, url: string): string | null {
  const mime = contentType?.split(';')[0]?.trim().toLowerCase()
  const byMime = mime ? Object.entries(IMAGE_MIME).find(([, m]) => m === mime)?.[0] : undefined
  if (byMime)
    return byMime
  try {
    const ext = path.extname(new URL(url).pathname).toLowerCase()
    if (IMAGE_MIME[ext])
      return ext
  }
  catch {
    /* 非法 URL 交由下载阶段报错 */
  }
  return null
}
