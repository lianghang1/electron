import type { FileInfo, FileSourceType, ResolveFileCoreResult } from './types'

import { getFileList } from '@/api/common'
import { isBase64, isUrl } from '@/utils'

/** 匹配别名或根路径形式的静态资源 */
const STATIC_PATH_RE = /^(?:@\/|\/)?(?:assets|static)\//

function resolveSourceType(url: string): FileSourceType {
  if (!url) {
    return 'unknown'
  }
  if (isBase64(url)) {
    return 'base64'
  }
  if (isUrl(url)) {
    return 'url'
  }
  if (STATIC_PATH_RE.test(url)) {
    return 'static'
  }
  return 'key'
}

async function resolveFile(url: string): Promise<FileInfo> {
  const sourceType = resolveSourceType(url)

  const fileInfo: FileInfo = {
    key: url,
    url,
    source: sourceType,
    raw: url,
  }

  if (sourceType === 'key') {
    try {
      const data = await getFileList(url, 1000 * 60)
      const firstFile = data?.[0]
      if (firstFile) {
        fileInfo.url = firstFile.thumbFileUrl
        fileInfo.raw = fileInfo
      }
    }
    catch (_) {}
  }

  return fileInfo
}

export async function resolveFileCore(url: string | string[]): Promise<ResolveFileCoreResult> {
  const urls = Array.isArray(url)
    ? url
    : typeof url === 'string'
      ? url.split(',').map(s => s.trim())
      : []

  const fetchQueue: Promise<FileInfo>[] = []

  for (const url of urls) {
    fetchQueue.push(resolveFile(url))
  }

  const fileInfoList = await Promise.all(fetchQueue)

  return {
    files: fileInfoList,
    urls,
    firstFile: fileInfoList?.[0],
    firstUrl: fileInfoList?.[0]?.url,
  }
}
