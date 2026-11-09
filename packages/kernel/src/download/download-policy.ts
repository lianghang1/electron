import type { DownloadTask, DownloadTaskStatus } from '@shell/shared'
import { resolve } from 'node:path'

/** Content-Disposition 的文件名来自服务器：去掉目录段与控制字符，杜绝路径穿越 */
export function safeFilename(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? ''
  const cleaned = [...base].filter((ch) => {
    const code = ch.charCodeAt(0)
    return code > 31 && code !== 127
  }).join('').trim()
  return cleaned || 'download'
}

export function progressPercent(received: number, total: number): number {
  if (total <= 0) { return -1 }
  return Math.min(100, Math.max(0, Math.round((received / total) * 100)))
}

export function shouldPushProgress(lastAt: number, now: number, throttleMs: number): boolean {
  return now - lastAt >= throttleMs
}

export function applyProgress(task: DownloadTask, received: number, total: number): DownloadTask {
  const effectiveTotal = total > 0 ? total : task.total
  return { ...task, received, total: effectiveTotal, percent: progressPercent(received, effectiveTotal) }
}

/**
 * 任务账本 → 可打开的文件路径。调用方只能传 taskId，路径不来自渲染层；
 * 不限制在默认下载目录内，saveAs 自选目录同样可用。
 */
export function resolveCompletedPath(task: DownloadTask | undefined, exists: (path: string) => boolean): string {
  if (!task || task.status !== 'completed') { throw new Error('下载任务未完成') }
  const target = resolve(task.path)
  if (!exists(target)) { throw new Error('下载文件不存在') }
  return target
}

export function resolveTerminal(task: DownloadTask, status: DownloadTaskStatus, now: number, reason?: string): DownloadTask {
  return { ...task, status, finishedAt: now, ...(reason ? { reason } : {}) }
}

/**
 * 授权结论回来前下载可能已经跑完，此时 cancel 无效但文件确实不该留：
 * 一律改判为 cancelled，避免横幅把被拒的文件显示成「已完成」。
 */
export function resolvePolicyDenial(task: DownloadTask, now: number): DownloadTask {
  return { ...task, status: 'cancelled', finishedAt: now, reason: 'policy' }
}

/** 终态任务保留一段时间供横幅展示；进行中任务永不因上限被裁掉 */
export function pruneTasks(
  tasks: readonly DownloadTask[],
  now: number,
  maxTasks: number,
  retainMs: number,
): DownloadTask[] {
  const fresh = tasks.filter(t => t.status === 'progressing' || t.finishedAt === undefined || now - t.finishedAt < retainMs)
  if (fresh.length <= maxTasks) { return fresh }
  const progressing = fresh.filter(t => t.status === 'progressing')
  const keepTerminal = Math.max(0, maxTasks - progressing.length)
  const terminal = keepTerminal === 0
    ? []
    : fresh.filter(t => t.status !== 'progressing').slice(-keepTerminal)
  const keep = new Set([...progressing, ...terminal].map(t => t.id))
  return fresh.filter(t => keep.has(t.id))
}
