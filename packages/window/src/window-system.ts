import type { ViewHost, ViewSpec } from '@shell/app-runtime'
import type { EventBus, Startable } from '@shell/kernel'
import type { CallerRegistry, FlavorManifest } from '@shell/shared'
import type { OverlayKind, OverlayPolicy } from './overlay-host'
import { join } from 'node:path'
import process from 'node:process'
import { registerIpcDomain } from '@shell/bridge/handle'
import { effectiveChrome, SHELL_APP_ID } from '@shell/shared'
import { windowDomain } from '@shell/shared/ipc'
import { app, BrowserWindow, WebContentsView } from 'electron'
import { createKioskMode, createWindowedMode } from './modes'
import { DEFAULT_OVERLAY_POLICIES, OverlayHost } from './overlay-host'
import { overlayBase, shellBase, win32OcclusionSwitch } from './presets'
import { applyNavigationGuards, installSessionGuards, parsePopupFeatures, SECURE_WEB_PREFERENCES } from './security'

/** 消息窗内容宽度与透明窗阴影余量：透明窗会硬裁超出位图的内容 */
const PANEL_WIDTH = 320
const SHADOW = 12
const SCREEN_MARGIN = 8
/** Shell 顶栏高度：消息窗从顶栏之下开始，不遮挡顶部导航 */
const TOPBAR_HEIGHT = 44

/**
 * WindowSystem：全仓库唯一 new BrowserWindow 的地方。
 * 对外只暴露目的命名 API——读调用处即读产品动作。
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
  private readonly flavor: FlavorManifest
  private readonly rendererDir: string
  private readonly initialTheme: 'light' | 'dark' | 'system'
  private readonly initialAccent: string
  /** 通用浮层宿主：新增浮层 = 注册一条策略，本类零分发 */
  readonly overlays: OverlayHost<OverlayKind>

  private callers?: CallerRegistry
  private permissionGate?: (appId: string, permission: string) => Promise<boolean>

  constructor(
    flavor: FlavorManifest,
    rendererDir: string,
    /** 启动外观：组合根从 flavor + 持久化设置读出，经启动参数同步注入渲染层 */
    initialTheme: 'light' | 'dark' | 'system' = 'system',
    /** 启动主色：用户设置覆盖（appearance.accent）优先，缺省跟随 flavor 品牌色 */
    initialAccent?: string,
  ) {
    this.flavor = flavor
    this.rendererDir = rendererDir
    this.initialTheme = initialTheme
    this.initialAccent = initialAccent || flavor.branding.accent
    this.overlays = new OverlayHost<OverlayKind>((policy, params) => this.createOverlay(policy, params))
    for (const policy of DEFAULT_OVERLAY_POLICIES) {
      this.overlays.register({ ...policy, parent: () => this.shellWindow })
    }
  }

  /** 注入事件总线（组合根在 createKernel 之后调用；崩溃事件经它广播） */
  bindEvents(events: EventBus): void {
    this.events = events
  }

  /**
   * 身份账本与系统权限闸门由组合根注入：窗口/视图创建时登记 webContents → appId，
   * 系统权限请求按调用方身份查权限策略表，页面无法伪造身份。
   */
  bindCallerRegistry(callers: CallerRegistry, gate: (appId: string, permission: string) => Promise<boolean>): void {
    this.callers = callers
    this.permissionGate = gate
  }

  /** Chromium 系统权限（摄像头/剪贴板/位置等）：session 闸门按调用方身份走权限策略链 */
  private applySessionGuards(session: Electron.Session, declared: 'all' | readonly string[]): void {
    installSessionGuards(session, {
      declared,
      callerOf: id => this.callers?.tryResolve(id),
      gate: (appId, permission) =>
        this.permissionGate
          ? this.permissionGate(appId, permission)
          : Promise.resolve(false),
    })
  }

  async start(): Promise<void> {}
  async stop(): Promise<void> {
    this.overlays.closeAll()
    for (const view of this.views.values()) { this.removeView(view) }
    this.views.clear()
    for (const win of this.windows.values()) { win.destroy() }
    this.windows.clear()
  }

  /** dev 模式 F12 切换 devtools（Electron 窗口默认不绑定 F12，仅未打包时注册） */
  private installDevToolsShortcut(win: BrowserWindow): void {
    if (app.isPackaged) { return }
    win.webContents.on('before-input-event', (_event, input) => {
      if (input.type === 'keyDown' && input.key === 'F12') {
        win.webContents.toggleDevTools()
      }
    })
  }

  /** 工作台主窗：tab 条 + 左导航的产品主体 */
  createShellWindow(): BrowserWindow {
    const mode = this.flavor.mode === 'kiosk' ? createKioskMode() : createWindowedMode()
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
          `--shell-accent=${this.initialAccent}`,
          `--shell-theme=${this.initialTheme}`,
          // 布局档位同步定型：solo 档无接缝底板，异步获取会让视图容器矩形首报落空
          `--shell-chrome=${effectiveChrome(this.flavor)}`,
        ],
      },
    })
    mode.enter(win)

    // 生产：加载本地产物；dev：electron-vite 注入 ELECTRON_RENDERER_URL
    const devUrl = process.env.ELECTRON_RENDERER_URL
    if (devUrl) { void win.loadURL(devUrl) }
    else { void win.loadFile(join(this.rendererDir, 'index.html')) }

    // 立即上屏：加载与 bundle 求值间隙里窗口不再缺席（win32 有 acrylic 材质打底，
    // 呈现为磨砂玻璃而非无窗「卡死」观感）；启动层 logo 随首帧绘制覆盖其上。
    // 过场动画不在此启动——等 shell:introBegin（首帧已绘）。
    win.show()

    // 过场起点 = 首帧已绘制（ready-to-show）：此刻 splash 帧已在合成器里，
    // 推送后渲染层才播 logo 动画 + 600ms 最短驻留。窗口上屏时机只有主进程知道，
    // 渲染层 visibilityState 在禁用 Win 遮罩计算时恒为 visible，不可作依据。
    let paintedOnce = false
    win.once('ready-to-show', () => {
      paintedOnce = true
      win.show()
      win.webContents.send('shell:introBegin')
    })
    // 已上屏后的重载（HMR/恢复模式）不会再触发 ready-to-show：load 完成即补发
    // 起点信号；渲染层按 introStartedAt 幂等去重
    win.webContents.on('did-finish-load', () => {
      if (paintedOnce && !win.isDestroyed() && win.isVisible()) {
        win.webContents.send('shell:introBegin')
      }
    })
    this.track(win, { appId: SHELL_APP_ID, instanceId: 'shell', kind: 'shell' })
    this.applySessionGuards(win.webContents.session, 'all')
    this.installDevToolsShortcut(win)
    // 从最小化/隐藏恢复时重放工作区：系统可能丢弃恢复前施加的 view bounds
    win.on('restore', () => this.replayContentRect())
    win.on('show', () => this.replayContentRect())
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
    return this.overlays.open('capture')
  }

  /** 授权弹窗 */
  openPermissionDialog(): BrowserWindow {
    return this.overlays.open('permission')
  }

  /** 应用中心浮窗 */
  openAppCenterOverlay(): BrowserWindow {
    return this.overlays.open('app-center')
  }

  /** 设置浮窗 */
  openSettingsOverlay(): BrowserWindow {
    return this.overlays.open('settings')
  }

  /** 通用宿主入口：会话/授权服务按种类取窗、带参数开窗、收场；新增浮层只改策略表 */
  openOverlay(kind: OverlayKind, params?: Readonly<Record<string, string>>): BrowserWindow {
    const win = this.overlays.open(kind, params)
    this.showOverlay(kind)
    return win
  }

  getOverlay(kind: OverlayKind): BrowserWindow | undefined {
    return this.overlays.get(kind)
  }

  dismissOverlay(kind: OverlayKind): void {
    this.hideOverlay(kind)
  }

  get(id: number): BrowserWindow | undefined {
    return this.windows.get(id)
  }

  /** 自绘标题栏的窗口控制通道：动作只作用于发起方自己的窗口（按 sender 定位，天然多窗安全） */
  registerWindowControls(): void {
    const own = (sender: Electron.WebContents) => BrowserWindow.fromWebContents(sender)
    registerIpcDomain(windowDomain, {
      minimize: (event) => {
        own(event.sender)?.minimize()
      },
      toggleMaximize: (event) => {
        const win = own(event.sender)
        if (!win) { return }
        if (win.isMaximized()) { win.unmaximize() }
        else { win.maximize() }
      },
      isMaximized: event => own(event.sender)?.isMaximized() ?? false,
      restore: (event) => {
        const win = own(event.sender)
        if (!win) { return }
        if (win.isMinimized()) { win.restore() }
        win.show()
        win.focus()
      },
      setAlwaysOnTop: (event, flag) => {
        own(event.sender)?.setAlwaysOnTop(Boolean(flag))
      },
      flash: (event, flag) => {
        own(event.sender)?.flashFrame(Boolean(flag))
      },
      close: (event) => {
        own(event.sender)?.close()
      },
      quit: () => app.quit(),
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

  private createOverlay(policy: OverlayPolicy<OverlayKind>, params: Readonly<Record<string, string>>): BrowserWindow {
    const parent = policy.parent?.()
    const initial = policy.bounds === 'fullscreen'
      ? (parent ? parent.getContentBounds() : { x: 0, y: 0, width: policy.width || 800, height: policy.height || 600 })
      : (parent ? this.anchorPanel(parent, policy.height) : { x: 0, y: 0, width: policy.width, height: policy.height })
    const win = new BrowserWindow({
      ...overlayBase,
      x: initial.x,
      y: initial.y,
      width: initial.width,
      height: initial.height,
      hasShadow: false,
      skipTaskbar: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      ...(parent ? { parent } : {}),
      webPreferences: {
        ...overlayBase.webPreferences,
        preload: join(this.rendererDir, '../preload/index.cjs'),
        // 独立分区：Shell / Web 容器的权限 handler 不放行摄像头，拍摄浮层需要自己的 guard
        partition: 'persist:overlay-window',
        backgroundThrottling: false,
        additionalArguments: [
          `--shell-accent=${this.initialAccent}`,
          `--shell-theme=${this.initialTheme}`,
          `--overlay-kind=${policy.kind}`,
        ],
      },
    })
    win.setMenu(null)
    const extra = new URLSearchParams(params).toString()
    const hash = extra ? `${policy.route}&${extra}` : policy.route
    const devUrl = process.env.ELECTRON_RENDERER_URL
    if (devUrl) { void win.loadURL(`${devUrl}/${hash}`) }
    else { void win.loadFile(join(this.rendererDir, 'index.html'), { hash: hash.replace(/^#/, '') }) }
    this.track(win, { appId: SHELL_APP_ID, instanceId: `overlay-${policy.kind}`, kind: 'overlay' })
    this.applySessionGuards(win.webContents.session, 'all')
    this.installDevToolsShortcut(win)
    return win
  }

  /** 消息区右下角锚定：顶部让出 Shell 顶栏，高度钳制在主窗内容区内 */
  private anchorPanel(parent: BrowserWindow, height: number): Electron.Rectangle {
    const content = parent.getContentBounds()
    const width = PANEL_WIDTH + SHADOW * 2
    return {
      x: Math.round(content.x + content.width - width - SCREEN_MARGIN),
      y: Math.round(content.y + TOPBAR_HEIGHT + SCREEN_MARGIN),
      width,
      height: Math.round(Math.min(height, content.height - TOPBAR_HEIGHT - SCREEN_MARGIN * 2)),
    }
  }

  /** 常驻浮层窗预创建：页面提前加载，首次弹出无加载延迟；全部保持隐藏直到 showOverlay */
  prewarmOverlays(): void {
    for (const policy of DEFAULT_OVERLAY_POLICIES) { this.overlays.open(policy.kind) }
  }

  /** 数据先行：页面加载完成后再显窗，避免首帧空白窗；消息区不抢焦点并整窗穿透 */
  showOverlay(kind: OverlayKind): void {
    const win = this.overlays.get(kind)
    if (!win || win.isDestroyed()) { return }
    const policy = this.overlays.policy(kind)
    const reveal = () => {
      if (win.isDestroyed()) { return }
      this.applyOverlayBounds(kind)
      if (policy.focus) {
        win.show()
        win.focus()
      }
      else {
        win.setIgnoreMouseEvents(policy.mouseIgnore, { forward: true })
        win.showInactive()
        win.moveTop()
      }
      this.events?.emit('overlay.opened', { kind })
    }
    if (win.webContents.isLoading()) { win.webContents.once('did-finish-load', reveal) }
    else { reveal() }
  }

  hideOverlay(kind: OverlayKind): void {
    this.overlays.hide(kind)
    this.events?.emit('overlay.closed', { kind })
  }

  applyOverlayBounds(kind: OverlayKind): void {
    const win = this.overlays.get(kind)
    const parent = this.shellWindow
    if (!win || win.isDestroyed() || !parent) { return }
    const policy = this.overlays.policy(kind)
    win.setBounds(policy.bounds === 'fullscreen' ? parent.getContentBounds() : this.anchorPanel(parent, win.getBounds().height))
  }

  /** 消息区页面量高回报：重设窗口高度，保持右下角锚定 */
  resizePanel(senderId: number, height: number): void {
    const win = this.overlays.get('panel')
    if (!win || win.isDestroyed() || win.webContents.id !== senderId || !Number.isFinite(height) || height <= 0) { return }
    const parent = this.shellWindow
    if (parent) { win.setBounds(this.anchorPanel(parent, height)) }
  }

  setPanelMouseIgnore(senderId: number, ignore: boolean): void {
    const win = this.overlays.get('panel')
    if (win && !win.isDestroyed() && win.webContents.id === senderId) {
      win.setIgnoreMouseEvents(ignore, { forward: true })
    }
  }

  sendToOverlay(kind: OverlayKind, channel: string, payload: unknown): void {
    const win = this.overlays.get(kind)
    if (win && !win.isDestroyed()) { win.webContents.send(channel, payload) }
  }

  isOverlaySender(kind: OverlayKind, senderId: number): boolean {
    return this.overlays.ownerOf(senderId) === kind
  }

  overlayKindOf(senderId: number): OverlayKind | undefined {
    return this.overlays.ownerOf(senderId)
  }

  overlayParamsOf(senderId: number): Readonly<Record<string, string>> {
    return this.overlays.paramsOf(senderId)
  }

  private track(win: BrowserWindow, caller: { appId: string, instanceId: string, kind: 'shell' | 'view' | 'overlay' }): void {
    const wcId = win.webContents.id
    this.windows.set(win.id, win)
    this.callers?.register(wcId, caller)
    win.on('closed', () => {
      this.windows.delete(win.id)
      this.callers?.unregister(wcId)
    })
    // 全部窗口关闭即退出
    if (this.windows.size === 1) { app.on('window-all-closed', () => app.quit()) }
  }

  // ── ViewHost SPI（packaged/remote 应用视图容器）────────────────

  /** 当前处于 HTML5 全屏的视图实例；null = 无。全屏视图铺满整窗，bounds 操作不回落工作区 */
  private htmlFullscreen: string | null = null

  create(spec: ViewSpec): unknown {
    const win = this.shellWindow
    if (!win) { throw new Error('[window] shell window not created yet') }

    const view = new WebContentsView({
      webPreferences: {
        // 安全基线写死（security.ts）：sandbox/contextIsolation/webSecurity 等，不按调用方放宽
        ...SECURE_WEB_PREFERENCES,
        preload: spec.preload,
        partition: spec.partition,
      },
    })
    this.views.set(spec.instanceId, view)
    win.contentView.addChildView(view)
    view.setVisible(false)

    const { webContents } = view
    this.callers?.register(webContents.id, { appId: spec.appId, instanceId: spec.instanceId, kind: 'view' })
    this.applySessionGuards(webContents.session, spec.permissions ?? [])
    void webContents.loadURL(spec.url)

    // 导航/新窗策略：白名单内跳转放行，window.open 升级为平台受管弹窗；白名单外转系统浏览器
    applyNavigationGuards(webContents, spec.allowedOrigins, (url, features) =>
      this.openManagedPopup(spec, url, features))
    // HTML5 全屏跟随：WebContentsView 不响应页面全屏请求，必须显式放大。
    // 窗口模式同步系统全屏——setFullScreen 是异步布局，等 enter-full-screen 后
    // 再铺 view（此时 getContentBounds 才是屏幕尺寸）；kiosk 恒为全屏，无 OS 状态
    // 切换，直接在整窗与工作区矩形间切换，绝不能调 setFullScreen(false) 破坏 kiosk
    webContents.on('enter-html-full-screen', () => {
      this.htmlFullscreen = spec.instanceId
      if (this.flavor.mode === 'kiosk') {
        view.setBounds(win.getContentBounds())
      }
      else {
        win.setFullScreen(true)
        win.once('enter-full-screen', () => {
          if (!view.webContents.isDestroyed() && this.htmlFullscreen === spec.instanceId) {
            view.setBounds(win.getContentBounds())
          }
        })
      }
      this.events?.emit('tabs.state-changed', { instanceId: spec.instanceId, action: 'fullscreen' })
    })
    webContents.on('leave-html-full-screen', () => {
      this.htmlFullscreen = null
      if (this.flavor.mode === 'kiosk') {
        if (this.activeViewId === spec.instanceId) { view.setBounds(this.contentRect) }
      }
      else {
        win.setFullScreen(false)
        win.once('leave-full-screen', () => {
          if (!view.webContents.isDestroyed() && this.activeViewId === spec.instanceId) {
            view.setBounds(this.contentRect)
          }
        })
      }
      this.events?.emit('tabs.state-changed', { instanceId: spec.instanceId, action: 'work-area' })
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
    // 全屏中的视图切回时铺满整窗（期间窗口处于 OS 全屏），否则按工作区矩形落位
    view.setBounds(this.htmlFullscreen === instanceId ? win.getContentBounds() : this.contentRect)
    // 垫场纪律：页面未加载完成不露白页（渲染层 accent 底透出），完成后仍是激活实例才显示
    if (view.webContents.isLoading()) {
      view.setVisible(false)
      const reveal = (): void => {
        if (this.activeViewId === instanceId) { view.setVisible(true) }
      }
      view.webContents.once('did-finish-load', reveal)
      // 主框架加载失败也要展开：Electron 错误页需可见可交互，否则垫场底色永挂无出口
      view.webContents.once('did-fail-load', (_event, _code, _desc, _url, isMainFrame) => {
        if (isMainFrame) { reveal() }
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
    for (const popup of this.popups.get(instanceId) ?? []) {
      if (!popup.isDestroyed()) { popup.close() }
    }
    this.popups.delete(instanceId)
    const view = this.views.get(instanceId)
    if (!view) { return }
    this.removeView(view)
    this.views.delete(instanceId)
    if (this.activeViewId === instanceId) { this.activeViewId = undefined }
    // 全屏视图销毁时退出 OS 全屏：状态是本系统引入的，销毁后无人恢复
    if (this.htmlFullscreen === instanceId) {
      this.htmlFullscreen = null
      if (this.flavor.mode !== 'kiosk') { this.shellWindow?.setFullScreen(false) }
    }
  }

  /**
   * 平台受管弹窗：window.open 的落点。继承父应用的 preload/session/权限声明与导航策略
   * （递归套用），身份入账本（kind=view）——弹窗内 JSAPI 调用与父应用同一信任面。
   */
  private popupSeq = 0
  private popups = new Map<string, BrowserWindow[]>()

  private openManagedPopup(spec: ViewSpec, url: string, features?: string): void {
    const parent = this.shellWindow
    if (!parent || parent.isDestroyed()) { return }
    const parsed = parsePopupFeatures(features)
    const bounds = parent.getContentBounds()
    // 先钳制再居中：features 要求的尺寸超出父窗时，尺寸与位置必须用同一份钳制值
    const width = Math.min(parsed.width, bounds.width)
    const height = Math.min(parsed.height, bounds.height)
    const win = new BrowserWindow({
      parent,
      width,
      height,
      x: Math.round(bounds.x + Math.max(0, (bounds.width - width) / 2)),
      y: Math.round(bounds.y + Math.max(0, (bounds.height - height) / 2)),
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        ...SECURE_WEB_PREFERENCES,
        preload: spec.preload,
        partition: spec.partition,
      },
    })
    win.setMenu(null)
    const instanceId = `${spec.instanceId}:popup-${++this.popupSeq}`
    this.track(win, { appId: spec.appId, instanceId, kind: 'view' })
    this.applySessionGuards(win.webContents.session, spec.permissions ?? [])
    applyNavigationGuards(win.webContents, spec.allowedOrigins, (popupUrl, popupFeatures) =>
      this.openManagedPopup(spec, popupUrl, popupFeatures))
    const list = this.popups.get(spec.instanceId) ?? []
    list.push(win)
    this.popups.set(spec.instanceId, list)
    win.on('closed', () => {
      const remaining = this.popups.get(spec.instanceId)
      if (remaining) { this.popups.set(spec.instanceId, remaining.filter(p => p !== win)) }
    })
    win.once('ready-to-show', () => {
      if (!win.isDestroyed()) { win.show() }
    })
    void win.loadURL(url)
  }

  /** Tab 细粒度：重载指定实例；全屏进出由 WebContentsView 的 HTML5 fullscreen 事件接管 */
  reload(instanceId: string): void {
    this.views.get(instanceId)?.webContents.reload()
    this.events?.emit('tabs.state-changed', { instanceId, action: 'reload' })
  }

  /** 工作区采信下限：低于此尺寸视为塌缩上报（窗口最小化/隐藏期间 getBoundingClientRect 的失真值），拒绝采信 */
  private static readonly WORK_AREA_FLOOR = 64

  setContentRect(rect: { x: number, y: number, width: number, height: number }): void {
    if (rect.width < WindowSystem.WORK_AREA_FLOOR || rect.height < WindowSystem.WORK_AREA_FLOOR) { return }
    this.contentRect = rect
    this.applyActiveBounds(rect)
    this.events?.emit('tabs.state-changed', { instanceId: this.activeViewId ?? '', action: 'work-area' })
  }

  /** 窗口从最小化/隐藏恢复时重放工作区矩形：期间施加的 bounds 可能被系统丢弃 */
  private replayContentRect(): void {
    if (!this.activeViewId) { return }
    this.applyActiveBounds(this.contentRect)
  }

  /** 激活视图落位的统一出口：全屏视图铺满整窗，其余按给定矩形（工作区上报/恢复重放共用） */
  private applyActiveBounds(rect: { x: number, y: number, width: number, height: number }): void {
    const view = this.activeViewId ? this.views.get(this.activeViewId) : undefined
    if (!view) { return }
    const win = this.shellWindow
    view.setBounds(this.htmlFullscreen === this.activeViewId && win ? win.getContentBounds() : rect)
  }

  /** 活跃视图实例（供组合根做 JSAPI origin 校验等） */
  get activeViewInstanceId(): string | undefined {
    return this.activeViewId
  }

  private removeView(view: Electron.WebContentsView): void {
    this.callers?.unregister(view.webContents.id)
    this.shellWindow?.contentView.removeChildView(view)
    view.webContents.close()
  }
}
