import type { DesktopConfig, DownloadTask } from '@desktop/shared'
import type { EventBus } from '../event/event-bus'
import type { CallerResolver } from '../ipc/caller-context'
import type { Logger } from '../logger/logger'
import type { PermissionService } from '../permission/permission-service'
import type { SessionService } from '../session/session-service'
import { join } from 'node:path'
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
    if (this.attached.has(appSession))
      return
    this.attached.add(appSession)

    appSession.on('will-download', (_event, item, webContents) => {
      // 权限把关：manifest 声明 → 直接放行；未声明 → 运行时授权
      // （已持久化允许的 App 免询问直接下载；否则弹授权卡，允许后重发下载，拒绝/超时取消本次）
      if (!this.permissionService.getPermissions(appId).includes('download')
        && !this.permissionService.hasRuntimeDecision(appId, 'download')) {
        item.cancel()
        const url = item.getURL()
        const context = this.resolver.resolve(webContents)
        this.logger.info('download not declared, requesting runtime permission', { appId, url })
        void this.permissionService.requestRuntime(context, 'download').then((allowed) => {
          if (!allowed) {
            this.logger.info('download denied', { appId, url })
            return
          }
          // 允许已持久化记忆：从原页面 webContents 重新发起下载——
          // blob: URL 只在创建它的页面会话内可解析，session.downloadURL 对它不可靠
          if (!webContents.isDestroyed())
            webContents.downloadURL(url)
        })
        return
      }

      const id = `dl-${Date.now()}-${++this.seq}`
      const filename = item.getFilename() || 'download'
      // 保存位置：saveAs 配置弹系统另存对话框选目录；默认静默保存到系统下载目录（Kiosk 友好）
      const defaultPath = join(app.getPath('downloads'), filename)
      if (this.config.download?.saveAs)
        item.setSaveDialogOptions({ title: '保存下载', defaultPath })
      else
        item.setSavePath(defaultPath)
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
    })
    this.logger.debug('download guard attached', { appId })
  }

  /** App 关闭时取消其进行中的下载（Tab 关闭联动，防孤儿下载） */
  cancelForApp(appId: string): void {
    for (const task of this.tasks.values()) {
      if (task.appId === appId && task.status === 'progressing')
        task.status = 'cancelled'
    }
  }

  /** 用户关闭面板时清空任务展示：进行中的下载继续、文件照常落盘，只是不再显示进度 */
  clearUI(): void {
    for (const timer of this.throttles.values())
      clearTimeout(timer)
    this.throttles.clear()
    this.tasks.clear()
    this.push()
  }

  /** 用系统默认程序打开已完成的下载文件（taskId 寻址，路径不可伪造） */
  async openFile(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task || task.status !== 'completed' || !task.path)
      throw new Error('download task not available')
    const error = await shell.openPath(task.path)
    if (error)
      this.logger.warn('open download failed', { taskId, error })
  }

  /** 在资源管理器中定位已完成的下载文件 */
  revealFile(taskId: string): void {
    const task = this.tasks.get(taskId)
    if (!task || task.status !== 'completed' || !task.path)
      throw new Error('download task not available')
    shell.showItemInFolder(task.path)
  }

  list(): DownloadTask[] {
    return [...this.tasks.values()].sort((a, b) => b.startedAt - a.startedAt).slice(0, MAX_TASKS)
  }

  private throttlePush(id: string): void {
    if (this.throttles.has(id))
      return
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
