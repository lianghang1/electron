import type { PrintOptions } from '@shell/shared'
import type { PreparedJob } from './prepared-job'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { paperToPrintPageSize } from '../paper'

/** HTML → PDF 存档的公共部分：边距推导、英寸换算、归档落盘。 */
export const PDF_EXPORT_TIMEOUT_MS = 30000
export const PDF_EXPORT_TIMEOUT_CODE = 'RENDER_FAILED' as const
export const PDF_EXPORT_TIMEOUT_MESSAGE = 'PDF 存档导出超时（30s）'

/** 连续纸没有 pageSize 概念；此时默认边距按零边距处理，避免模板回流。 */
export function resolveEffectiveMargin(job: PreparedJob): PrintOptions['margin'] {
  const continuous = paperToPrintPageSize(job.paper) === undefined
  const m = job.options.margin
  return continuous && (m == null || m === 'default') ? 'none' : (m ?? 'default')
}

const mmToInch = (mm: number): number => Math.max(0, mm) / 25.4

/** printToPDF 存档 margins（英寸）：default 省略由 Chromium 决定 */
export function pdfMarginsInches(margin: PrintOptions['margin']): Record<string, number> {
  if (margin === 'default' || margin == null) {
    return { top: 9.6 / 25.4, bottom: 9.6 / 25.4, left: 9.6 / 25.4, right: 9.6 / 25.4 }
  }
  if (margin === 'none') {
    return { top: 0, bottom: 0, left: 0, right: 0 }
  }
  return {
    top: mmToInch(margin.topMm),
    bottom: mmToInch(margin.bottomMm),
    left: mmToInch(margin.leftMm),
    right: mmToInch(margin.rightMm),
  }
}

/** 把 PDF 缓冲写入任务归档目录，返回可重打引用的绝对路径。 */
export async function writePdfArchive(buffer: Uint8Array, jobId: string, archiveDir: string): Promise<string> {
  await mkdir(archiveDir, { recursive: true })
  const archivedPdfPath = path.join(archiveDir, `${jobId}.pdf`)
  await writeFile(archivedPdfPath, buffer)
  return archivedPdfPath
}
