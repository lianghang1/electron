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
      // 权限把关：manifest 声明 / 已持久化允许 → 直接放行；
      // 未声明 → item.pause() 挂起下载走运行时授权：允许后 resume 继续原下载，
      // 拒绝/超时 cancel。不采用「取消后重发 downloadURL」——blob: URL 重发不可靠，
      // pause/resume 保持原下载会话，任意 URL 形态（blob:/data:/http）都天然可用
      const declared = this.permissionService.getPermissions(appId).includes('download')
        || this.permissionService.hasRuntimeDecision(appId, 'download')
      if (!declared) {
        const url = item.getURL()
        const context = this.resolver.resolve(webContents)
        this.logger.info('download not declared, pausing for runtime permission', { appId, url })
        item.pause()
        void this.permissionService.requestRuntime(context, 'download').then((allowed) => {
          // 决策返回时 item 可能已随 Tab 关闭销毁（DownloadItem 无 isDestroyed，操作会抛）
          try {
            if (!allowed) {
              this.logger.info('download denied', { appId, url })
              item.cancel()
              return
            }
            this.beginTask(appId, item)
            item.resume()
          }
          catch (error) {
            this.logger.warn('download item gone before permission applied', { appId, error: String(error) })
          }
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
  }

  /** App 关闭时取消其进行中的下载（Tab 关闭联动，防孤儿下载） */
  cancelForApp(appId: string): void {
    for (const task of this.tasks.values()) {
      if (task.appId === appId && task.status === 'progressing')
        task.status = 'cancelled'
    }
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
