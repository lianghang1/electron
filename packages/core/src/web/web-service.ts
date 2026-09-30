import type { CallerContext, DesktopAppManifest, WorkAreaRect } from '@desktop/shared'
import type { CallerResolver } from '../ipc/caller-context'
import type { Logger } from '../logger/logger'
import type { PermissionService } from '../permission/permission-service'
import type { SessionService } from '../session/session-service'
import type { WindowService } from '../window/window-service'
import { join } from 'node:path'
import { BrowserWindow, WebContentsView } from 'electron'
import {
  applySessionPermissionGuards,
  applyWebAppGuards,
  sessionToPlatformPermission,
  toSessionPermissions,
} from '../window/security'

/** Web App 运行时：一个 Tab 对应一个 WebContentsView（第一阶段 1:1） */
export interface WebAppRuntime {
  runtimeId: string
  view: WebContentsView
}

/** 平台受管弹窗的 webPreferences 安全基线（与 Web 容器一致，写死不配置） */
const SECURE_WEB_PREFERENCES = {
  sandbox: true,
  contextIsolation: true,
  webSecurity: true,
  nodeIntegration: false,
  nodeIntegrationInWorker: false,
  nodeIntegrationInSubFrames: false,
  webviewTag: false,
  allowRunningInsecureContent: false,
  experimentalFeatures: false,
} as const

/**
 * Web App 容器：负责 WebContentsView 的创建 / 加载 / 显示 / 销毁。
 * Runtime 对象只留在 Main，对外只暴露 runtimeId（= tabId）。
 */
export class WebService {
  private runtimes = new Map<string, WebAppRuntime>()
  /** Shell 声明的 Web App 容器区域（窗口内容区坐标） */
  private workArea: WorkAreaRect | null = null
  private focusedId: string | null = null
  /** 激活视图处于 HTML5 全屏（view 铺满整窗，忽略容器区域） */
  private htmlFullscreen = false
  /** Shell DOM 浮层（Tab 右键菜单等）打开期间抑制激活视图显示 */
  private suppressed = false
  /** 已挂权限 guard 的 Session，避免同一 App Session 重复挂 */
  private readonly guardedSessions = new WeakSet<Electron.Session>()

  constructor(
    private readonly windowService: WindowService,
    private readonly sessionService: SessionService,
    private readonly resolver: CallerResolver,
    private readonly permissionService: PermissionService,
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
        // internal App 注入平台 preload（无业务通道的最小桥）；第三方 App 不注入
        ...internalPreload(manifest),
        ...SECURE_WEB_PREFERENCES,
      },
    })

    this.applyGuards(context.appId, view, manifest)
    this.attachHtmlFullscreen(view)
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

  /**
   * Shell DOM 浮层（Tab 右键菜单等）需要盖住容器区域时调用：
   * true = 激活视图归零让位（Shell DOM 压不过 WebContentsView 原生层），false = 恢复。
   */
  setSuppressed(value: boolean): void {
    if (this.suppressed === value)
      return
    this.suppressed = value
    this.applyBounds()
  }

  destroy(runtimeId: string): void {
    const runtime = this.runtimes.get(runtimeId)
    if (!runtime)
      return
    this.resolver.unregister(runtime.view.webContents.id)
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

  /** 激活视图占满容器区域，其余归零隐藏；HTML5 全屏时铺满整窗 */
  private applyBounds(): void {
    const win = this.windowService.getMainWindow()
    if (!win)
      return
    for (const [id, runtime] of this.runtimes) {
      if (id === this.focusedId && !this.suppressed && this.htmlFullscreen) {
        const content = win.getContentBounds()
        runtime.view.setBounds({ x: 0, y: 0, width: content.width, height: content.height })
        continue
      }
      const area = id === this.focusedId && !this.suppressed ? this.workArea : null
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

  /**
   * HTML5 全屏跟随：WebContentsView 不响应页面全屏请求，必须显式放大。
   * 语义贴近浏览器：窗口进入 OS 全屏，视图铺满整窗；退出后恢复容器区域。
   * 注意：不做 maximize 兜底——它会让窗口停在最大化而非全屏（工作区高 ≠ 屏幕高），
   * 还会拖慢页面 fullscreen promise 的 resolve，连带页面侧的全屏定时器一起顺延。
   */
  private attachHtmlFullscreen(view: WebContentsView): void {
    view.webContents.on('enter-html-full-screen', () => {
      this.htmlFullscreen = true
      const win = this.windowService.getMainWindow()
      if (!win)
        return
      win.setFullScreen(true)
      // setFullScreen 是异步布局：窗口真正进入全屏后再铺 view（getContentBounds 此时 = 屏幕尺寸）
      win.once('enter-full-screen', () => {
        if (!this.htmlFullscreen)
          return
        this.applyBounds()
      })
    })
    view.webContents.on('leave-html-full-screen', () => {
      this.htmlFullscreen = false
      const win = this.windowService.getMainWindow()
      if (!win)
        return
      win.setFullScreen(false)
      // 退出全屏完成后再恢复容器区域，避免与全屏布局收尾竞态
      win.once('leave-full-screen', () => this.applyBounds())
    })
  }

  /** 导航策略按 manifest 限定；Electron 权限挂在 App Session 上（默认全拒） */
  private applyGuards(appId: string, view: WebContentsView, manifest: DesktopAppManifest): void {
    const defaultOrigin = new URL(manifest.entry.url).origin
    applyWebAppGuards(
      view.webContents,
      manifest.security?.allowedOrigins ?? [defaultOrigin],
      (url, features) => this.createPopupWindow(view.webContents, manifest, url, features),
    )

    const appSession = view.webContents.session
    if (this.guardedSessions.has(appSession))
      return
    this.guardedSessions.add(appSession)
    // session 按 App 隔离（persist:app-<appId>）：声明权限直接放行，
    // 未声明权限走运行时授权（推送 Shell 请用户决策）
    applySessionPermissionGuards(appSession, toSessionPermissions(manifest.permissions ?? []), (wc, sessionPermission) => {
      this.logger.debug('runtime permission approval requested', { appId, sessionPermission, wcId: wc.id })
      const permission = sessionToPlatformPermission(sessionPermission)
      if (!permission)
        return Promise.resolve(false)
      return this.permissionService.requestRuntime(this.resolver.resolve(wc), permission)
    })
    this.logger.debug('session permission guards applied', { appId })
  }

  /**
   * 平台受管弹窗：window.open 的目标在允许 Origin 内时由平台创建。
   * 安全基线与 Web 容器一致；Session 继承父 App（登录态延续）；
   * 身份继承父容器（appId/instanceId），契约参数永不携带身份。
   * 弹窗自身的导航 / 再弹窗走同一套策略（递归受管）。
   */
  private createPopupWindow(
    opener: Electron.WebContents,
    manifest: DesktopAppManifest,
    url: string,
    features?: string,
  ): void {
    const parent = this.windowService.getMainWindow()
    if (!parent) {
      this.logger.warn('popup dropped: main window is not ready', { url })
      return
    }
    const parentContext = this.resolver.resolve(opener)
    const allowedOrigins = manifest.security?.allowedOrigins ?? [new URL(manifest.entry.url).origin]
    const { width, height } = parseWindowFeatures(features)

    const popup = new BrowserWindow({
      width,
      height,
      parent,
      autoHideMenuBar: true,
      title: manifest.name,
      webPreferences: {
        session: this.sessionService.getSession(parentContext.appId),
        // 受管弹窗与父容器同一套能力集（同 App 能力一致）
        ...internalPreload(manifest),
        ...SECURE_WEB_PREFERENCES,
      },
    })
    popup.setMenuBarVisibility(false)

    // 弹窗与父容器同一套导航 / 弹窗策略：Origin 内可再开受管弹窗
    applyWebAppGuards(popup.webContents, allowedOrigins, (childUrl, childFeatures) =>
      this.createPopupWindow(popup.webContents, manifest, childUrl, childFeatures))

    // closed 时弹窗已销毁：webContents 须存活期捕获 id，销毁后访问会抛 Object has been destroyed
    const popupWcId = popup.webContents.id
    this.resolver.register(popup.webContents, {
      appId: parentContext.appId,
      instanceId: parentContext.instanceId,
    })
    popup.on('closed', () => {
      this.resolver.unregister(popupWcId)
      this.logger.debug('popup closed', { appId: parentContext.appId, url })
    })

    void popup.loadURL(url).catch((error) => {
      this.logger.error(`failed to load popup url: ${url}`, { error: String(error) })
    })
    this.logger.info('popup window created', { appId: parentContext.appId, url })
  }
}

/** window.open 的 features 串（width=600,height=400）→ 尺寸，缺省 900x600 */
function parseWindowFeatures(features?: string): { width: number, height: number } {
  const result = { width: 900, height: 600 }
  for (const part of features?.split(',') ?? []) {
    const [key, raw] = part.split('=')
    const value = Number.parseInt(raw ?? '', 10)
    if (key === 'width' && Number.isFinite(value))
      result.width = value
    if (key === 'height' && Number.isFinite(value))
      result.height = value
  }
  return result
}

/** internal App 注入平台 preload（无业务通道的最小桥）；第三方 App 保持无桥最小面 */
function internalPreload(manifest: DesktopAppManifest): { preload?: string } {
  return manifest.type === 'internal'
    ? { preload: join(__dirname, '../preload/index.cjs') }
    : {}
}
