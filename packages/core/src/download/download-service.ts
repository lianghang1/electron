import type { DesktopConfig, DownloadTask } from '@desktop/shared'
import type { EventBus } from '../event/event-bus'
import type { CallerResolver } from '../ipc/caller-context'
import type { Logger } from '../logger/logger'
import type { PermissionService } from '../permission/permission-service'
import type { SessionService } from '../session/session-service'
import { rm } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { app, shell } from 'electron'

/** 进度推送节流间隔（毫秒） */
const PROGRESS_THROTTLE_MS = 500
/** 已结束任务保留时长（毫秒），供 Shell 横幅展示完成/失败状态 */
const FINISHED_RETAIN_MS = 30_000
/** 任务列表上限，防止无限增长 */
const MAX_TASKS = 50

/**
 * 下载管理：App 声明 download 权限后才允许下载（session 级 will-download 把关），
 * 默认保存到系统下载目录，任务状态经 EventBus 推送 Shell 横幅展示。
 */
export class DownloadService {
  private readonly tasks = new Map<string, DownloadTask>()
  /** 已挂 will-download 的 Session（App Session 全局唯一，WeakSet 防重复） */
  private readonly attached = new WeakSet<Electron.Session>()
  /** item → 任务映射：拒绝决策需回写已抢先完成的任务状态（WeakMap 不阻止 item 回收） */
  private readonly itemTasks = new WeakMap<Electron.DownloadItem, DownloadTask>()
  private readonly throttles = new Map<string, NodeJS.Timeout>()
  private seq = 0

  constructor(
    private readonly sessionService: SessionService,
    private readonly permissionService: PermissionService,
    private readonly events: EventBus,
    private readonly logger: Logger,
    private readonly resolver: CallerResolver,
    private readonly config: DesktopConfig,
  ) {}

  /** 挂载到 App Session（App 首次取得 Session 时由 Application 接线触发） */
  attach(appId: string, appSession: Electron.Session = this.sessionService.getSession(appId)): void {
    if (this.attached.has(appSession)) { return }
    this.attached.add(appSession)

    appSession.on('will-download', (_event, item, webContents) => {
      // 权限把关：manifest 声明 / 已持久化允许 → 直接放行；未声明 → 放行下载同时异步请用户决策
      // （允许：静默继续；拒绝：取消并清理部分文件）。
      // 不采用 pause/resume 等待授权：will-download 阶段 pause 存在已知不可靠窗口
      // （首包未落地时 pause，resume 可能不续传——表现为"首次不下载，下次才下载"），
      // 且等待决策期间页面可能放弃下载（blob: URL revoke / 超时），挂起的 item 会失效
      const declared = this.permissionService.getPermissions(appId).includes('download')
        || this.permissionService.hasRuntimeDecision(appId, 'download')
      const url = item.getURL()
      if (!declared) {
        const context = this.resolver.resolve(webContents)
        this.logger.info('download not declared, running while asking runtime permission', { appId, url })
        this.beginTask(appId, item)
        void this.permissionService.requestRuntime(context, 'download').then((allowed) => {
          if (allowed) {
            this.logger.info('download runtime permission granted (already running)', { appId, url })
            return
          }
          // 拒绝：取消下载并清理部分文件
          this.logger.info('download denied by user', { appId, url })
          const savePath = item.getSavePath()
          try {
            item.cancel()
          }
          catch (error) {
            this.logger.warn('download item gone before deny applied', { appId, error: String(error) })
          }
          // 下载若在用户决策前已抢先完成，cancel 已无效：同步把任务改写为已取消，
          // 避免横幅残留「已完成」误导用户（对应文件已被下方清理删除）
          const task = this.itemTasks.get(item)
          if (task && task.status === 'completed') {
            task.status = 'cancelled'
            this.push()
          }
          if (savePath) {
            void rm(savePath, { force: true }).catch((error) => {
              this.logger.warn('denied download partial cleanup failed', { appId, savePath, error: String(error) })
            })
          }
        }).catch((error) => {
          this.logger.error('download runtime permission failed', { appId, error: String(error) })
          try {
            item.cancel()
          }
          catch { /* item 已随页面销毁 */ }
        })
        return
      }

      this.beginTask(appId, item)
    })
    this.logger.debug('download guard attached', { appId })
  }

  /** 从已放行的 DownloadItem 开始任务：落盘路径 + 进度/完成事件接线（直接下载与授权后恢复共用） */
  private beginTask(appId: string, item: Electron.DownloadItem): void {
    const id = `dl-${Date.now()}-${++this.seq}`
    // basename 加固：Content-Disposition 的文件名来自服务器，防路径穿越逃出下载目录
    const filename = basename(item.getFilename() || 'download')
    // 保存位置：saveAs 配置弹系统另存对话框选目录；默认静默保存到系统下载目录（Kiosk 友好）。
    // 运行时授权恢复的下载已在挂起前预设路径（抑制默认对话框），沿用不再二次指定
    if (!item.getSavePath()) {
      const defaultPath = join(app.getPath('downloads'), filename)
      if (this.config.download?.saveAs) { item.setSaveDialogOptions({ title: '保存下载', defaultPath }) }
      else { item.setSavePath(defaultPath) }
    }
    const task: DownloadTask = {
      id,
      appId,
      filename,
      path: item.getSavePath(),
      received: 0,
      total: item.getTotalBytes(),
      percent: 0,
      status: 'progressing',
      startedAt: Date.now(),
    }
    this.tasks.set(id, task)
    this.itemTasks.set(item, task)
    this.push()

    item.on('updated', (_e, state) => {
      task.received = item.getReceivedBytes()
      task.total = item.getTotalBytes()
      task.percent = task.total > 0 ? Math.floor((task.received / task.total) * 100) : -1
      task.status = state === 'interrupted' ? 'interrupted' : 'progressing'
      this.throttlePush(id)
    })
    item.once('done', (_e, state) => {
      this.clearThrottle(id)
      task.status = state === 'completed' ? 'completed' : state
      task.received = item.getReceivedBytes()
      // saveAs 模式下路径由用户选择决定，完成时回填
      task.path = item.getSavePath()
      this.logger.info(`download ${task.status}`, { appId, filename })
      this.push()
      // 结束的任务保留一段时间供横幅展示，随后清理
      setTimeout(() => {
        this.tasks.delete(id)
        this.push()
      }, FINISHED_RETAIN_MS).unref?.()
    })
  }

  /** App 关闭时取消其进行中的下载（Tab 关闭联动，防孤儿下载） */
  cancelForApp(appId: string): void {
    for (const task of this.tasks.values()) {
      if (task.appId === appId && task.status === 'progressing') { task.status = 'cancelled' }
    }
  }

  /** 用系统默认程序打开已完成的下载文件（taskId 寻址，路径不可伪造） */
  async openFile(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task || task.status !== 'completed' || !task.path) { throw new Error('download task not available') }
    const error = await shell.openPath(task.path)
    if (error) { this.logger.warn('open download failed', { taskId, error }) }
  }

  /** 在资源管理器中定位已完成的下载文件 */
  revealFile(taskId: string): void {
    const task = this.tasks.get(taskId)
    if (!task || task.status !== 'completed' || !task.path) { throw new Error('download task not available') }
    shell.showItemInFolder(task.path)
  }

  list(): DownloadTask[] {
    return [...this.tasks.values()].sort((a, b) => b.startedAt - a.startedAt).slice(0, MAX_TASKS)
  }

  private throttlePush(id: string): void {
    if (this.throttles.has(id)) { return }
    this.throttles.set(id, setTimeout(() => {
      this.throttles.delete(id)
      this.push()
    }, PROGRESS_THROTTLE_MS))
  }

  private clearThrottle(id: string): void {
    const timer = this.throttles.get(id)
    if (timer) {
      clearTimeout(timer)
      this.throttles.delete(id)
    }
  }

  private push(): void {
    this.events.emit('download:updated', this.list())
  }
}
