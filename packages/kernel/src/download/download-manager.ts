import type { DownloadTask } from '@shell/shared'
import type { EventBus } from '../event-bus'
import type { Startable } from '../lifecycle'
import type { Logger } from '../logger'
import { rm } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { shell } from 'electron'
import { applyProgress, progressPercent, pruneTasks, resolvePolicyDenial, resolveTerminal, safeFilename, shouldPushProgress } from './download-policy'

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
 * 文件操作只按 taskId 间接寻址且校验路径在受管下载目录内，页面无法用任意路径触达文件系统。
 */
export class DownloadManager implements Startable {
  readonly name = 'downloads'
  private readonly tasks = new Map<string, DownloadTask>()
  private readonly items = new Map<string, Electron.DownloadItem>()
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

  attach(ses: Electron.Session, appId: string): void {
    if (this.attached.has(ses)) { return }
    this.attached.add(ses)
    ses.on('will-download', (_event, item) => {
      const url = item.getURL()
      const filename = safeFilename(item.getFilename())
      if (!item.getSavePath()) {
        const defaultPath = join(this.options.downloadsDir, filename)
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
        // 异步决策期间不 pause：首包未落地时 resume 可能不续传，页面也可能已放弃 blob URL
        void decision
          .then((d) => {
            if (d === 'deny') { this.deny(item, task) }
          })
          .catch(() => this.deny(item, task))
      }
    })
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
    const path = this.completedPath(taskId)
    const err = await shell.openPath(path)
    if (err) { throw new Error(err) }
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
    const task = this.tasks.get(taskId)
    if (!task || task.status !== 'completed') { throw new Error('下载任务未完成') }
    const root = resolve(this.options.downloadsDir)
    const target = resolve(task.path)
    if (!target.startsWith(root + sep)) { throw new Error('下载路径不在受管目录内') }
    return target
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
      this.push()
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
    const keep = new Set(kept.map(t => t.id))
    for (const id of this.tasks.keys()) {
      if (!keep.has(id)) { this.forget(id) }
    }
    this.options.events.emit('download.tasks-changed', { tasks: kept.sort((a, b) => b.startedAt - a.startedAt) })
  }

  private forget(taskId: string): void {
    this.tasks.delete(taskId)
    this.items.delete(taskId)
    this.lastPush.delete(taskId)
  }
}
