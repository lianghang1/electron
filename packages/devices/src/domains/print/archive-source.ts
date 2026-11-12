import type { PrintPayload } from '@shell/shared'
import { copyFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { printError } from './errors'

/**
 * 本地文件负载的归档副本：把业务传入的源文件复制进任务归档目录，
 * 之后的送打、存档引用、重打、删除全部只面向副本。
 *
 * 没有这一层时 PDF 直通会把源文件路径当作 archivedPdfPath 回传，
 * 删除任务记录 / 清空任务簿会连带删除业务原始文件。
 */

/** 归档副本文件名：与任务号绑定，保留原扩展名，重打与清扫都能识别。 */
export function archiveFileName(jobId: string, sourcePath: string): string {
  return `${jobId}-source${path.extname(sourcePath).toLowerCase()}`
}

/** 目标路径是否落在归档目录内；用 relative 判边界，防前缀欺骗与 ../ 穿越。 */
export function isWithinArchive(targetPath: string, archiveDir: string): boolean {
  const rel = path.relative(path.resolve(archiveDir), path.resolve(targetPath))
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}

/**
 * 把 file 负载的源路径换成归档副本路径。
 * 已在归档目录内的路径（URL 下载产物、副本重打）直接复用，不重复复制。
 */
export function copySourceIntoArchive(sourcePath: string, archiveDir: string, jobId: string): string {
  if (isWithinArchive(sourcePath, archiveDir)) { return sourcePath }
  mkdirSync(archiveDir, { recursive: true })
  const target = path.join(archiveDir, archiveFileName(jobId, sourcePath))
  try {
    copyFileSync(sourcePath, target)
  }
  catch (err) {
    throw printError('VALIDATION_FAILED', `源文件无法复制到归档目录: ${err instanceof Error ? err.message : String(err)}`, { sourcePath })
  }
  return target
}

/** 仅 file 负载需要复制；html / url 负载的内容已在归档目录或内存里。 */
export function needsArchiveCopy(payload: PrintPayload): payload is Extract<PrintPayload, { kind: 'file' }> {
  return payload.kind === 'file'
}
