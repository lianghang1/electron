import { readdir, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * 归档目录生命周期：
 * 任务簿上限 200 条，被挤出任务簿的记录其归档 PDF 成为孤儿。启动时清扫
 * 「超过保留期 且 无在册任务引用」的归档文件；在册任务的 PDF 仍由 UI 管理
 * （删除/清空记录连带删除），保证近期任务的重打能力不受影响。
 */

export interface ArchiveFileInfo {
  name: string
  mtimeMs: number
}

/** 纯函数：返回应删除的文件名列表（单测覆盖） */
export function planArchiveCleanup(
  files: ArchiveFileInfo[],
  referenced: ReadonlySet<string>,
  retentionDays: number,
  now = Date.now(),
): string[] {
  if (retentionDays <= 0)
    return []
  const cutoff = now - retentionDays * 86400000
  return files
    .filter(f => f.mtimeMs < cutoff && !referenced.has(f.name))
    .map(f => f.name)
}

/** 扫描归档目录并删除孤儿文件，返回已删除的文件名（目录不存在/不可读返回空） */
export async function cleanupArchiveDir(
  archiveDir: string,
  referenced: ReadonlySet<string>,
  retentionDays: number,
): Promise<string[]> {
  let names: string[]
  try {
    names = await readdir(archiveDir)
  }
  catch {
    return []
  }
  const infos = await Promise.all(
    names.map(async (name): Promise<ArchiveFileInfo | null> => {
      try {
        const st = await stat(join(archiveDir, name))
        return st.isFile() ? { name, mtimeMs: st.mtimeMs } : null
      }
      catch {
        return null
      }
    }),
  )
  const doomed = planArchiveCleanup(infos.filter((f): f is ArchiveFileInfo => f !== null), referenced, retentionDays)
  await Promise.all(doomed.map(name => unlink(join(archiveDir, name)).catch(() => {})))
  return doomed
}
