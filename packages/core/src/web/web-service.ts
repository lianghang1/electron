import type { CallerContext, DesktopAppManifest, WorkAreaRect } from '@desktop/shared'
import type { CallerResolver } from '../ipc/caller-context'
import type { Logger } from '../logger/logger'
import type { SessionService } from '../session/session-service'
import type { WindowService } from '../window/window-service'
import { WebContentsView } from 'electron'
import { applySessionPermissionGuards, applyWebAppGuards, toSessionPermissions } from '../window/security'

/** Web App 运行时：一个 Tab 对应一个 WebContentsView（第一阶段 1:1） */
export interface WebAppRuntime {
  runtimeId: string
  view: WebContentsView
}

/**
 * Web App 容器：负责 WebContentsView 的创建 / 加载 / 显示 / 销毁。
 * Runtime 对象只留在 Main，对外只暴露 runtimeId（= tabId）。
 */
export class WebService {
  private runtimes = new Map<string, WebAppRuntime>()
  /** Shell 声明的 Web App 容器区域（窗口内容区坐标） */
  private workArea: WorkAreaRect | null = null
  private focusedId: string | null = null
  /** 已挂权限 guard 的 Session，避免同一 App Session 重复挂 */
  private readonly guardedSessions = new WeakSet<Electron.Session>()

  constructor(
    private readonly windowService: WindowService,
    private readonly sessionService: SessionService,
    private readonly resolver: CallerResolver,
    private readonly logger: Logger,
  ) {}

  /** 创建 Web 运行时并挂到主窗口（零尺寸挂载，等 focus / setWorkArea 再展开） */
  create(context: CallerContext, manifest: DesktopAppManifest): WebAppRuntime {
    const tabId = context.tabId
    if (!tabId)
      throw new Error('[web-service] tabId is required to create a web runtime')

    const view = new WebContentsView({
      webPreferences: {
        session: this.sessionService.getSession(context.appId),
        // 与主窗口一致的安全基线：写死不配置；Web 容器不注入 preload
        sandbox: true,
        contextIsolation: true,
        webSecurity: true,
        nodeIntegration: false,
        nodeIntegrationInWorker: false,
        nodeIntegrationInSubFrames: false,
        webviewTag: false,
        allowRunningInsecureContent: false,
        experimentalFeatures: false,
      },
    })

    this.applyGuards(context.appId, view, manifest)
    this.resolver.register(view.webContents, context)

    const runtime: WebAppRuntime = { runtimeId: tabId, view }
    this.runtimes.set(runtime.runtimeId, runtime)

    const win = this.windowService.getMainWindow()
    if (!win)
      throw new Error('[web-service] main window is not ready')
    win.contentView.addChildView(view)
    view.setBounds({ x: 0, y: 0, width: 0, height: 0 })

    void view.webContents.loadURL(manifest.entry.url).catch((error) => {
      this.logger.error(`failed to load app url: ${manifest.entry.url}`, { error: String(error) })
    })

    return runtime
  }

  load(runtimeId: string, url: string): void {
    void this.get(runtimeId)
      .view
      .webContents
      .loadURL(url)
      .catch((error) => {
        this.logger.error(`failed to load url: ${url}`, { error: String(error) })
      })
  }

  reload(runtimeId: string): void {
    this.get(runtimeId).view.webContents.reload()
  }

  /** 把某个 Tab 的视图置顶显示（其余视图归零隐藏） */
  focus(runtimeId: string): void {
    this.focusedId = runtimeId
    this.applyBounds()
  }

  /** Shell 布局变化时更新容器区域，并立即作用到当前激活视图 */
  setWorkArea(rect: WorkAreaRect): void {
    this.workArea = rect
    this.applyBounds()
  }

  destroy(runtimeId: string): void {
    const runtime = this.runtimes.get(runtimeId)
    if (!runtime)
      return
    this.resolver.unregister(runtime.view.webContents)
    this.windowService.getMainWindow()?.contentView.removeChildView(runtime.view)
    runtime.view.webContents.close()
    this.runtimes.delete(runtimeId)
    if (this.focusedId === runtimeId)
      this.focusedId = null
  }

  /** 释放全部 Web 运行时（Application 退出时调用） */
  dispose(): void {
    for (const id of [...this.runtimes.keys()]) this.destroy(id)
  }

  private get(runtimeId: string): WebAppRuntime {
    const runtime = this.runtimes.get(runtimeId)
    if (!runtime)
      throw new Error(`[web-service] runtime not found: ${runtimeId}`)
    return runtime
  }

  /** 激活视图占满容器区域，其余归零隐藏 */
  private applyBounds(): void {
    const win = this.windowService.getMainWindow()
    if (!win)
      return
    for (const [id, runtime] of this.runtimes) {
      const area = id === this.focusedId ? this.workArea : null
      runtime.view.setBounds(
        area
          ? {
              x: Math.round(area.x),
              y: Math.round(area.y),
              width: Math.round(area.width),
              height: Math.round(area.height),
            }
          : { x: 0, y: 0, width: 0, height: 0 },
      )
    }
  }

  /** 导航策略按 manifest 限定；Electron 权限挂在 App Session 上（默认全拒） */
  private applyGuards(appId: string, view: WebContentsView, manifest: DesktopAppManifest): void {
    const defaultOrigin = new URL(manifest.entry.url).origin
    applyWebAppGuards(view, manifest.security?.allowedOrigins ?? [defaultOrigin])

    const appSession = view.webContents.session
    if (this.guardedSessions.has(appSession))
      return
    this.guardedSessions.add(appSession)
    // session 按 App 隔离（persist:app-<appId>），guard 挂 manifest 声明的权限
    applySessionPermissionGuards(appSession, toSessionPermissions(manifest.permissions ?? []))
    this.logger.debug('session permission guards applied', { appId })
  }
}
