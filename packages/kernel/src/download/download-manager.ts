import type { DownloadTask } from '@shell/shared'
import type { EventBus } from '../event-bus'
import type { Startable } from '../lifecycle'
import type { Logger } from '../logger'
import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { shell } from 'electron'
import { applyProgress, progressPercent, pruneTasks, resolveCompletedPath, resolvePolicyDenial, resolveTerminal, safeFilename, shouldPushProgress } from './download-policy'

export type DownloadGate = (ctx: { appId: string, url: string, filename: string }) => 'allow' | 'deny' | Promise<'allow' | 'deny'>

export interface DownloadManagerOptions {
  events: EventBus
  logger: Logger
  /** 策略门控由组合根注入（权限服务）；kernel 不认识上层策略 */
  gate: DownloadGate
  downloadsDir: string
  saveAs?: boolean
  now?: () => number
  throttleMs?: number
  maxTasks?: number
  retainMs?: number
}

/**
 * 下载管理：按应用会话分区挂 will-download 门控，任务账本经事件总线推全量快照。
 * 文件操作只按 taskId 间接寻址，路径取自主进程账本，页面无法用任意路径触达文件系统。
 */
export class DownloadManager implements Startable {
  readonly name = 'downloads'
  private readonly tasks = new Map<string, DownloadTask>()
  private readonly items = new Map<string, Electron.DownloadItem>()
  /** 门控悬决中的任务：不进快照、终态不广播，决策落地经 revealPending 补发 */
  private readonly pendingGate = new Set<string>()
  private readonly attached = new WeakSet<Electron.Session>()
  private readonly lastPush = new Map<string, number>()
  private readonly now: () => number
  private readonly throttleMs: number
  private readonly maxTasks: number
  private readonly retainMs: number
  private seq = 0

  constructor(private readonly options: DownloadManagerOptions) {
    this.now = options.now ?? Date.now
    this.throttleMs = options.throttleMs ?? 500
    this.maxTasks = options.maxTasks ?? 50
    this.retainMs = options.retainMs ?? 30_000
  }

  /**
   * 静默落盘重名避让：`name (1).ext` 递增。避让对象含在途任务已占用的落盘路径——
   * 连续同名下载时首个文件尚未落盘，只查磁盘会同路径覆盖
   */
  private uniqueSavePath(path: string): string {
    const taken = new Set([...this.tasks.values()].map(t => t.path))
    if (!existsSync(path) && !taken.has(path)) { return path }
    const dir = dirname(path)
    const ext = extname(path)
    const stem = basename(path, ext)
    for (let n = 1; ; n++) {
      const candidate = join(dir, `${stem} (${n})${ext}`)
      if (!existsSync(candidate) && !taken.has(candidate)) { return candidate }
    }
  }

  attach(ses: Electron.Session, appId: string): void {
    if (this.attached.has(ses)) { return }
    this.attached.add(ses)
    ses.on('will-download', (_event, item) => {
      const url = item.getURL()
      const filename = safeFilename(item.getFilename())
      if (!item.getSavePath()) {
        const defaultPath = this.uniqueSavePath(join(this.options.downloadsDir, filename))
        if (this.options.saveAs) { item.setSaveDialogOptions({ title: '保存下载', defaultPath }) }
        else { item.setSavePath(defaultPath) }
      }
      const task = this.beginTask(appId, item, filename)
      const decision = this.options.gate({ appId, url, filename })
      if (decision === 'deny') {
        this.deny(item, task)
        return
      }
      if (decision !== 'allow') {
        // 异步决策期间不 pause：首包未落地时 resume 可能不续传，页面也可能已放弃 blob URL。
        // 下载继续但不进快照、终态押后到决策落地：权限弹窗悬决时不出现「下载成功」虚报
        this.pendingGate.add(task.id)
        void decision
          .then((d) => {
            this.pendingGate.delete(task.id)
            if (d === 'deny') { this.deny(item, task) }
            else { this.revealPending(task.id) }
          })
          .catch(() => {
            this.pendingGate.delete(task.id)
            this.deny(item, task)
          })
      }
    })
  }

  /** 决策放行后补发押后的快照与终态：决策期间下载可能已跑到终态 */
  private revealPending(taskId: string): void {
    const task = this.tasks.get(taskId)
    if (!task) { return }
    this.push()
    if (task.status !== 'progressing') { this.emitTerminal(task) }
  }

  list(): DownloadTask[] {
    return [...this.tasks.values()].sort((a, b) => b.startedAt - a.startedAt)
  }

  cancel(taskId: string): void {
    const item = this.items.get(taskId)
    if (!item) { return }
    try { item.cancel() }
    catch { /* item 已随页面销毁 */ }
  }

  async open(taskId: string): Promise<void> {
    // 文件被移动/删除等场景用户必须有反馈（master 只记日志，现场表现为点了没反应）；
    // resolveCompletedPath 对缺失文件直接抛错，必须在此拦下转为通知而非向上抛
    let path: string
    try {
      path = this.completedPath(taskId)
    }
    catch (err) {
      this.emitOpenFailed(taskId, err instanceof Error ? err.message : String(err))
      return
    }
    const err = await shell.openPath(path)
    if (!err) { return }
    this.emitOpenFailed(taskId, err)
  }

  private emitOpenFailed(taskId: string, reason: string): void {
    const filename = this.tasks.get(taskId)?.filename ?? ''
    this.options.logger.warn('打开下载文件失败', { taskId, error: reason })
    this.options.events.emit('download.open-failed', { taskId, filename, reason })
  }

  async reveal(taskId: string): Promise<void> {
    shell.showItemInFolder(this.completedPath(taskId))
  }

  dismiss(taskId: string): void {
    this.forget(taskId)
    this.push()
  }

  async start(): Promise<void> {}

  async stop(): Promise<void> {
    for (const item of this.items.values()) {
      try { item.cancel() }
      catch { /* item 已随页面销毁 */ }
    }
    this.tasks.clear()
    this.items.clear()
    this.lastPush.clear()
  }

  private completedPath(taskId: string): string {
    return resolveCompletedPath(this.tasks.get(taskId), existsSync)
  }

  private beginTask(appId: string, item: Electron.DownloadItem, filename: string): DownloadTask {
    const id = `dl-${String(this.now())}-${String(++this.seq)}`
    const task: DownloadTask = {
      id,
      appId,
      filename,
      path: item.getSavePath(),
      received: item.getReceivedBytes(),
      total: item.getTotalBytes(),
      percent: progressPercent(item.getReceivedBytes(), item.getTotalBytes()),
      status: 'progressing',
      startedAt: this.now(),
    }
    this.tasks.set(id, task)
    this.items.set(id, item)
    this.lastPush.set(id, this.now())

    item.on('updated', (_e, state) => {
      if (state !== 'progressing') { return }
      const current = this.tasks.get(id)
      if (!current || current.status !== 'progressing') { return }
      const at = this.now()
      if (!shouldPushProgress(this.lastPush.get(id) ?? 0, at, this.throttleMs)) { return }
      this.lastPush.set(id, at)
      this.tasks.set(id, applyProgress(current, item.getReceivedBytes(), item.getTotalBytes()))
      if (!this.pendingGate.has(id)) { this.push() }
    })

    item.once('done', (_e, state) => {
      const current = this.tasks.get(id)
      if (!current || current.status !== 'progressing') { return }
      const at = this.now()
      let next: DownloadTask
      switch (state) {
        case 'completed': next = resolveTerminal(current, 'completed', at); break
        case 'cancelled': next = resolveTerminal(current, 'cancelled', at, 'user'); break
        case 'interrupted': next = resolveTerminal(current, 'interrupted', at, state); break
        default: next = resolveTerminal(current, 'failed', at, state)
      }
      this.tasks.set(id, next)
      // 门控悬决期的终态只记账：批准后经 revealPending 补发，拒绝走 deny 清场
      if (this.pendingGate.has(id)) { return }
      this.push()
      this.emitTerminal(next)
    })

    this.push()
    return task
  }

  private deny(item: Electron.DownloadItem, task: DownloadTask): void {
    try { item.cancel() }
    catch { /* item 可能已完成，cancel 无效 */ }
    const current = this.tasks.get(task.id)
    if (current && (current.status === 'progressing' || current.status === 'completed')) {
      this.tasks.set(task.id, resolvePolicyDenial(current, this.now()))
      this.push()
      this.options.events.emit('download.cancelled', { taskId: task.id, appId: task.appId, reason: 'policy' })
    }
    const savePath = item.getSavePath()
    if (savePath) {
      void rm(savePath, { force: true }).catch((err: unknown) => {
        this.options.logger.warn('被拒下载的部分文件清理失败', { taskId: task.id, error: String(err) })
      })
    }
  }

  private emitTerminal(task: DownloadTask): void {
    const { events } = this.options
    if (task.status === 'completed') {
      events.emit('download.completed', { taskId: task.id, appId: task.appId, filename: task.filename })
    }
    else if (task.status === 'cancelled') {
      events.emit('download.cancelled', { taskId: task.id, appId: task.appId, reason: task.reason === 'policy' ? 'policy' : 'user' })
    }
    else {
      events.emit('download.failed', { taskId: task.id, appId: task.appId, reason: task.reason ?? task.status })
    }
  }

  private push(): void {
    const kept = pruneTasks([...this.tasks.values()], this.now(), this.maxTasks, this.retainMs)
      .filter(t => !this.pendingGate.has(t.id))
    const keep = new Set(kept.map(t => t.id))
    for (const id of this.tasks.keys()) {
      // 门控悬决任务不在快照里但账必须保留：决策落地还要补发终态/清场
      if (!keep.has(id) && !this.pendingGate.has(id)) { this.forget(id) }
    }
    this.options.events.emit('download.tasks-changed', { tasks: kept.sort((a, b) => b.startedAt - a.startedAt) })
  }

  private forget(taskId: string): void {
    this.tasks.delete(taskId)
    this.items.delete(taskId)
    this.lastPush.delete(taskId)
  }
}
