import type { ViewHost, ViewSpec } from '@shell/app-runtime'
import type { EventBus, Startable } from '@shell/kernel'
import type { FlavorManifest } from '@shell/shared'
import { join } from 'node:path'
import process from 'node:process'
import { matchesOrigin } from '@shell/shared'
import { app, BrowserWindow, ipcMain, WebContentsView } from 'electron'
import { createDesktopMode, createKioskMode } from './modes'
import { overlayBase, shellBase, win32OcclusionSwitch } from './presets'

/**
 * WindowSystem：全仓库唯一 new BrowserWindow 的地方（铁律一）。
 * 对外只暴露目的命名 API——读调用处即读产品动作（铁律二）。
 * 同时实现 ViewHost SPI：packaged/remote 应用的 WebContentsView 容器。
 */
export class WindowSystem implements Startable, ViewHost {
  readonly name = 'window'
  private windows = new Map<number, BrowserWindow>()
  private shellWindowId?: number
  /** 视图容器：instanceId → WebContentsView（隐藏态挂载） */
  private views = new Map<string, Electron.WebContentsView>()
  private activeViewId?: string
  private contentRect = { x: 0, y: 0, width: 0, height: 0 }
  private events?: EventBus

  constructor(
    private readonly flavor: FlavorManifest,
    private readonly rendererDir: string,
    /** 启动外观：组合根从 flavor + 持久化设置读出，经启动参数同步注入渲染层 */
    private readonly initialTheme: 'light' | 'dark' | 'system' = 'system',
  ) {}

  /** 注入事件总线（组合根在 createKernel 之后调用；崩溃事件经它广播） */
  bindEvents(events: EventBus): void {
    this.events = events
  }

  async start(): Promise<void> {}
  async stop(): Promise<void> {
    for (const view of this.views.values()) { this.removeView(view) }
    this.views.clear()
    for (const win of this.windows.values()) { win.destroy() }
    this.windows.clear()
  }

  /** 工作台主窗：tab 条 + 左导航的产品主体 */
  createShellWindow(): BrowserWindow {
    const mode = this.flavor.mode === 'kiosk' ? createKioskMode() : createDesktopMode()
    // 浮层/视图体系需要 Windows 停止合成补偿
    const win = new BrowserWindow({
      ...shellBase,
      ...win32OcclusionSwitch,
      width: 1280,
      height: 800,
      // shell 桥必须注入：preload 与 main/preload 产物同层（out/preload/index.cjs）。
      // 沙箱保持 shellBase 的 true——preload 只用 contextBridge/ipcRenderer（白名单内）+
      // 全局 process.argv，CJS 产物下沙箱可用，勿因 ESM preload 而关沙箱
      webPreferences: {
        ...shellBase.webPreferences,
        preload: join(this.rendererDir, '../preload/index.cjs'),
        // 启动外观：同步随 preload 抵达，渲染层挂载前即可应用（零闪烁；不走异步 IPC）
        additionalArguments: [
          `--shell-accent=${this.flavor.branding.accent}`,
          `--shell-theme=${this.initialTheme}`,
        ],
      },
    })
    mode.enter(win)

    // 生产：加载本地产物；dev：electron-vite 注入 ELECTRON_RENDERER_URL
    const devUrl = process.env.ELECTRON_RENDERER_URL
    if (devUrl) { void win.loadURL(devUrl) }
    else { void win.loadFile(join(this.rendererDir, 'index.html')) }

    win.once('ready-to-show', () => win.show())
    this.track(win)
    this.shellWindowId = win.id
    if (this.flavor.mode === 'kiosk') { this.installKioskWatchdog(win) }
    return win
  }

  /**
   * Kiosk 看门狗：渲染进程异常退出 → 退避重启（1s/2s/3s）；连续 3 次进恢复模式
   * （加载自检页而非无限重启循环——断电重启必落在可交互状态的变体）。
   * 稳定运行 60s 后计数归零。
   */
  private kioskRestarts = 0
  private kioskStableTimer?: NodeJS.Timeout

  private installKioskWatchdog(win: BrowserWindow): void {
    win.webContents.on('render-process-gone', (_event, details) => {
      this.events?.emit('crash.renderer-gone', { windowId: win.id, reason: details.reason, restartCount: this.kioskRestarts })

      if (this.kioskRestarts >= 3) {
        this.events?.emit('watchdog.recovery-mode', { reason: `renderer gone x${this.kioskRestarts}: ${details.reason}` })
        const devUrl = process.env.ELECTRON_RENDERER_URL
        const recovery = devUrl ? `${devUrl}/#/recovery` : undefined
        if (recovery) { void win.loadURL(recovery) }
        else { void win.loadFile(join(this.rendererDir, 'index.html'), { hash: '/recovery' }) }
        return
      }

      this.kioskRestarts++
      const delayMs = this.kioskRestarts * 1000
      setTimeout(() => {
        app.relaunch()
        app.exit(0)
      }, delayMs)
    })

    // 稳定运行计时：60s 无崩溃即归零退避计数
    win.webContents.once('did-finish-load', () => {
      this.kioskStableTimer?.refresh()
      this.kioskStableTimer = setTimeout(() => {
        this.kioskRestarts = 0
      }, 60_000)
    })
  }

  /** 工作台主窗（视图挂载与托盘重建都用它） */
  get shellWindow(): BrowserWindow | undefined {
    return this.shellWindowId ? this.windows.get(this.shellWindowId) : undefined
  }

  /** 拍摄浮窗 */
  openCaptureOverlay(): BrowserWindow {
    return this.createOverlay('capture')
  }

  /** 授权弹窗 */
  openPermissionDialog(): BrowserWindow {
    return this.createOverlay('permission')
  }

  /** 应用中心浮窗 */
  openAppCenterOverlay(): BrowserWindow {
    return this.createOverlay('app-center')
  }

  /** 设置浮窗 */
  openSettingsOverlay(): BrowserWindow {
    return this.createOverlay('settings')
  }

  get(id: number): BrowserWindow | undefined {
    return this.windows.get(id)
  }

  /** 自绘标题栏的窗口控制通道：动作只作用于发起方自己的窗口（按 sender 定位，天然多窗安全） */
  registerWindowControls(): void {
    ipcMain.handle('window:minimize', (event) => {
      BrowserWindow.fromWebContents(event.sender)?.minimize()
    })
    ipcMain.handle('window:toggle-maximize', (event) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) { return }
      if (win.isMaximized()) { win.unmaximize() }
      else { win.maximize() }
    })
    ipcMain.handle('window:close', (event) => {
      BrowserWindow.fromWebContents(event.sender)?.close()
    })
  }

  /** 平台事件广播：EventBus 全量事件转发给所有存活窗口的渲染层（渲染层经 bridge.onEvent 订阅） */
  attachEventBroadcast(events: EventBus): void {
    events.onAny((name, payload) => {
      for (const win of this.windows.values()) {
        if (!win.isDestroyed()) { win.webContents.send(`event:${name}`, payload) }
      }
    })
  }

  private createOverlay(kind: string): BrowserWindow {
    const win = new BrowserWindow({ ...overlayBase, width: 480, height: 360 })
    const devUrl = process.env.ELECTRON_RENDERER_URL
    const hash = `#/overlay?kind=${kind}`
    if (devUrl) { void win.loadURL(`${devUrl}/${hash}`) }
    else { void win.loadFile(join(this.rendererDir, 'index.html'), { hash }) }
    win.once('ready-to-show', () => win.show())
    this.track(win)
    return win
  }

  private track(win: BrowserWindow): void {
    this.windows.set(win.id, win)
    win.on('closed', () => this.windows.delete(win.id))
    // 全部窗口关闭即退出（托盘常驻由 TraySystem M6 接管后调整）
    if (this.windows.size === 1) { app.on('window-all-closed', () => app.quit()) }
  }

  // ── ViewHost SPI（packaged/remote 应用视图容器）────────────────

  create(spec: ViewSpec): unknown {
    const win = this.shellWindow
    if (!win) { throw new Error('[window] shell window not created yet') }

    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        // 恒为 true：jsapi preload 只用 contextBridge/ipcRenderer，白名单内沙箱可用
        sandbox: true,
        preload: spec.preload,
        partition: spec.partition,
      },
    })
    this.views.set(spec.instanceId, view)
    win.contentView.addChildView(view)
    view.setVisible(false)

    const { webContents } = view
    void webContents.loadURL(spec.url)

    // origin 白名单强制：导航出白名单即拦截回退
    webContents.on('will-navigate', (event, url) => {
      if (!this.isOriginAllowed(url, spec.allowedOrigins)) { event.preventDefault() }
    })
    webContents.setWindowOpenHandler(({ url }) => {
      return { action: this.isOriginAllowed(url, spec.allowedOrigins) ? 'allow' : 'deny' }
    })
    // 权限请求（摄像头/麦克风等）默认拒绝——kiosk 场景由设备域承接，不经页面授权
    webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => {
      callback(false)
    })
    // 崩溃自愈：Chrome 式 Tab 恢复（渲染层感知后按退避策略重开实例）
    webContents.on('render-process-gone', (_event, details) => {
      this.events?.emit('crash.renderer-gone', {
        windowId: win.id,
        reason: details.reason,
        restartCount: 0,
      })
    })

    return view
  }

  activate(instanceId: string): void {
    const win = this.shellWindow
    const view = this.views.get(instanceId)
    if (!win || !view) { return }
    if (this.activeViewId && this.activeViewId !== instanceId) { this.views.get(this.activeViewId)?.setVisible(false) }
    this.activeViewId = instanceId
    view.setBounds(this.contentRect)
    // 垫场纪律：页面未加载完成不露白页（渲染层 accent 底透出），完成后仍是激活实例才显示
    if (view.webContents.isLoading()) {
      view.setVisible(false)
      view.webContents.once('did-finish-load', () => {
        if (this.activeViewId === instanceId) { view.setVisible(true) }
      })
    }
    else {
      view.setVisible(true)
    }
  }

  deactivate(instanceId: string): void {
    if (this.activeViewId === instanceId) {
      this.views.get(instanceId)?.setVisible(false)
      this.activeViewId = undefined
    }
  }

  destroy(instanceId: string): void {
    const view = this.views.get(instanceId)
    if (!view) { return }
    this.removeView(view)
    this.views.delete(instanceId)
    if (this.activeViewId === instanceId) { this.activeViewId = undefined }
  }

  setContentRect(rect: { x: number, y: number, width: number, height: number }): void {
    this.contentRect = rect
    if (this.activeViewId) { this.views.get(this.activeViewId)?.setBounds(rect) }
  }

  /** 活跃视图实例（供组合根做 JSAPI origin 校验等） */
  get activeViewInstanceId(): string | undefined {
    return this.activeViewId
  }

  private removeView(view: Electron.WebContentsView): void {
    this.shellWindow?.contentView.removeChildView(view)
    view.webContents.close()
  }

  private isOriginAllowed(url: string, allowed: string[]): boolean {
    return matchesOrigin(url, allowed)
  }
}
