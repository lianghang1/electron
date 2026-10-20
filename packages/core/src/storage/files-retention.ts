import type { Dirent } from 'node:fs'
import type { Logger } from '../logger/logger'
import { readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { filesDir } from './app-paths'

/** 业务产物默认保留天数 */
const DEFAULT_RETENTION_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

/** 产物域目录（filesDir 之下，均为平铺文件） */
const PRODUCT_DIRS = ['capture', 'print', 'signature'] as const

/**
 * 业务产物过期清理：启动时按文件修改时间清掉超过保留期的文件
 * （照片 / 打印归档 / 签名落盘后不再改动，mtime 即产生时间）。
 * 仅清域目录顶层的平铺文件，单域失败不阻断其余域。
 */
export function cleanupExpiredFiles(retentionDays: number | undefined, logger: Logger): void {
  const days = retentionDays ?? DEFAULT_RETENTION_DAYS
  if (days <= 0) { return }
  const cutoff = Date.now() - days * DAY_MS
  for (const dir of PRODUCT_DIRS) {
    cleanupDir(join(filesDir(), dir), cutoff, logger)
  }
}

function cleanupDir(dir: string, cutoff: number, logger: Logger): void {
  let entries: Dirent[]
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  }
  catch {
    return
  }
  for (const entry of entries) {
    if (!entry.isFile()) { continue }
    const filePath = join(dir, entry.name)
    try {
      if (statSync(filePath).mtimeMs < cutoff) {
        rmSync(filePath, { force: true })
        logger.info(`expired product file removed: ${entry.name}`)
      }
    }
    catch (error) {
      // 单文件清理失败不阻断其余文件
      logger.warn(`product file cleanup failed: ${filePath}`, { error: String(error) })
    }
  }
}
