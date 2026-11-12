import type { JobStatus, PrintError, PrintRemoteState, PrintRequest, PrintResult } from '@shell/shared'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { isWithinArchive } from './archive-source'

interface JobRecord {
  jobId: string
  jobName: string
  request: PrintRequest
  state: JobStatus['state']
  createdAt: string
  finishedAt?: string
  result?: PrintResult
  error?: PrintError
  printingSince?: string
  stuck?: boolean
  remoteState?: PrintRemoteState
}

const MAX_RECORDS = 200
const DEFAULT_STUCK_THRESHOLD_MS = 120_000

/**
 * 任务簿：状态查询 / 任务列表 / 重打 / 审计的数据源。
 * 持久化文件路径由装配方注入（userData/print-jobs.json）——重启后任务历史与重打仍可用。
 */
export class JobStore {
  private jobs = new Map<string, JobRecord>()
  private saveTimer: ReturnType<typeof setTimeout> | null = null
  private readonly filePath: string

  constructor(filePath: string, private readonly archiveDir?: string) {
    this.filePath = path.resolve(filePath)
    // 任务簿是 storage/ 目录下与 electron-store 并列的独立写方，不依赖其建目录
    mkdirSync(path.dirname(this.filePath), { recursive: true })
    this.load()
  }

  private load(): void {
    try {
      if (!existsSync(this.filePath)) { return }
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as JobRecord[]
      if (!Array.isArray(parsed)) { return }
      for (const rec of parsed.slice(0, MAX_RECORDS)) {
        if (!rec?.jobId) { continue }
        this.jobs.set(rec.jobId, rec)
      }
    }
    catch (err) {
      console.error('[print] 任务簿加载失败:', err)
    }
  }

  private scheduleSave(): void {
    if (this.saveTimer) { return }
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      try {
        writeFileSync(this.filePath, JSON.stringify([...this.jobs.values()]), 'utf8')
      }
      catch (err) {
        console.error('[print] 任务簿写入失败:', err)
      }
    }, 500)
  }

  create(request: PrintRequest, jobId: string, jobName: string): JobRecord {
    const record: JobRecord = {
      jobId,
      jobName,
      request,
      state: 'accepted',
      createdAt: new Date().toISOString(),
    }
    this.jobs.set(record.jobId, record)
    if (this.jobs.size > MAX_RECORDS) {
      const oldest = this.jobs.keys().next().value
      if (oldest) { this.jobs.delete(oldest) }
    }
    this.scheduleSave()
    return record
  }

  markPrinting(jobId: string): void {
    const rec = this.jobs.get(jobId)
    if (!rec) { return }
    rec.state = 'printing'
    rec.printingSince = new Date().toISOString()
    this.scheduleSave()
  }

  /** 扫描长时间停留在 printing 的任务并打上卡住标记，返回命中的 jobId 列表。 */
  detectStuck(thresholdMs = DEFAULT_STUCK_THRESHOLD_MS, now = Date.now()): string[] {
    const hit: string[] = []
    for (const rec of this.jobs.values()) {
      if (rec.state !== 'printing' || !rec.printingSince) { continue }
      const since = Date.parse(rec.printingSince)
      if (Number.isFinite(since) && now - since >= thresholdMs) {
        rec.stuck = true
        hit.push(rec.jobId)
      }
    }
    if (hit.length > 0) { this.scheduleSave() }
    return hit
  }

  /** 记录通道回读的任务级状态。 */
  markRemoteState(jobId: string, state: PrintRemoteState): void {
    const rec = this.jobs.get(jobId)
    if (!rec) { return }
    rec.remoteState = state
    this.scheduleSave()
  }

  finish(jobId: string, result: PrintResult): void {
    const rec = this.jobs.get(jobId)
    if (!rec) { return }
    rec.result = result
    rec.state = 'done'
    rec.finishedAt = new Date().toISOString()
    this.scheduleSave()
  }

  /** 失败落簿：记录统一错误（失败原因查询与任务中心展示用） */
  fail(jobId: string, error: PrintError): void {
    const rec = this.jobs.get(jobId)
    if (!rec) { return }
    rec.error = error
    rec.state = 'failed'
    rec.finishedAt = new Date().toISOString()
    this.scheduleSave()
  }

  get(jobId: string): JobRecord | undefined {
    return this.jobs.get(jobId)
  }

  /** 最近任务列表（创建时间倒序） */
  list(limit = 50): JobStatus[] {
    const all = [...this.jobs.values()].reverse()
    return all.slice(0, Math.max(1, limit)).map(rec => this.toStatus(rec))
  }

  status(jobId: string): JobStatus | undefined {
    const rec = this.jobs.get(jobId)
    return rec ? this.toStatus(rec) : undefined
  }

  /** 在册任务引用的归档文件名集合（归档清理时豁免，保证近期任务可重打） */
  referencedArchiveFiles(): Set<string> {
    const set = new Set<string>()
    for (const rec of this.jobs.values()) {
      const p = rec.result?.archivedPdfPath
      if (p) { set.add(path.basename(p)) }
    }
    return set
  }

  /** 删除单条任务记录；连带删除其归档 PDF（默认行为），返回是否删除了记录 */
  remove(jobId: string, opts: { deletePdf?: boolean } = {}): boolean {
    const rec = this.jobs.get(jobId)
    if (!rec) { return false }
    this.jobs.delete(jobId)
    if (opts.deletePdf !== false) { this.deleteArchivedPdf(rec.result?.archivedPdfPath) }
    this.scheduleSave()
    return true
  }

  /** 清空全部任务记录；连带删除所有归档 PDF，返回删除的条数 */
  clear(opts: { deletePdf?: boolean } = {}): number {
    const n = this.jobs.size
    if (opts.deletePdf !== false) {
      for (const rec of this.jobs.values()) { this.deleteArchivedPdf(rec.result?.archivedPdfPath) }
    }
    this.jobs.clear()
    this.scheduleSave()
    return n
  }

  private deleteArchivedPdf(pdfPath?: string): void {
    if (!pdfPath || !existsSync(pdfPath)) { return }
    // 只允许删除任务归档目录内的副本：历史记录若被写入业务源路径，删除动作必须拒绝而不是连带删源文件
    if (!this.archiveDir || !isWithinArchive(pdfPath, this.archiveDir)) {
      console.warn('[print] 拒绝删除归档目录之外的文件:', pdfPath)
      return
    }
    try {
      rmSync(pdfPath, { force: true })
    }
    catch (err) {
      console.error('[print] 归档 PDF 删除失败:', pdfPath, err)
    }
  }

  private toStatus(rec: JobRecord): JobStatus {
    const status: JobStatus = {
      jobId: rec.jobId,
      jobName: rec.jobName,
      state: rec.state,
      createdAt: rec.createdAt,
      finishedAt: rec.finishedAt,
      result: rec.result,
      error: rec.error,
    }
    if (rec.stuck) { status.stuck = true }
    if (rec.remoteState) { status.remoteState = rec.remoteState }
    const started = Date.parse(rec.createdAt)
    const end = rec.finishedAt ? Date.parse(rec.finishedAt) : Date.now()
    if (Number.isFinite(started) && Number.isFinite(end)) {
      status.elapsedMs = Math.max(0, end - started)
    }
    return status
  }
}
