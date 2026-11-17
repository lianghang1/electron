import type { ViewHost, ViewSpec } from '@shell/app-runtime'
import type { EventBus, Startable } from '@shell/kernel'
import type { CallerRegistry, FlavorManifest } from '@shell/shared'
import { join } from 'node:path'
import process from 'node:process'
import { registerIpcDomain } from '@shell/bridge/handle'
import { effectiveChrome, isDevLoad, SHELL_APP_ID } from '@shell/shared'
import { windowDomain } from '@shell/shared/ipc'
import { app, BrowserWindow, WebContentsView } from 'electron'
import { createKioskMode, createWindowedMode } from './modes'
import { overlayBase, shellBase } from './presets'
import { applyNavigationGuards, installSessionGuards, parsePopupFeatures, SECURE_WEB_PREFERENCES } from './security'

/**
 * WindowSystem：全仓库唯一 new BrowserWindow / new WebContentsView 的地方。
 * 对外只暴露目的命名 API——读调用处即读产品动作。
 * 同时实现 ViewHost SPI：packaged/remote 应用的 WebContentsView 容器。
 */
export class WindowSystem implements Startable, ViewHost {
  readonly name = 'window'
  private windows = new Map<number, BrowserWindow>()
  private shellWindowId?: number
  /** 视图容器：instanceId → WebContentsView（隐藏态挂载） */
  private views = new Map<string, Electron.WebContentsView>()
  /** 主框架加载失败的视图：保持隐藏（渲染层失败兜底可见），重试的 did-start-loading 清账 */
  private failedViews = new Set<string>()
  private activeViewId?: string
  private contentRect = { x: 0, y: 0, width: 0, height: 0 }
  private events?: EventBus
  private readonly flavor: FlavorManifest
  private readonly rendererDir: string
  private readonly initialTheme: 'light' | 'dark' | 'system'
  private readonly initialAccent: string

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
    if (this.plane && !this.plane.isDestroyed()) { this.plane.destroy() }
    this.plane = undefined
    for (const view of this.views.values()) { this.removeView(view) }
    this.views.clear()
    for (const win of this.windows.values()) { win.destroy() }
    this.windows.clear()
  }

  /**
   * dev 模式 F12 切换 devtools（Electron 窗口默认不绑定 F12，仅 dev 态注册）；
   *  WebContentsView 不支持 dock 挂靠，devtools 独窗承载（docked=false）
   */
  private installDevToolsShortcut(wc: Electron.WebContents, docked: boolean): void {
    if (!isDevLoad()) { return }
    wc.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown' || input.key !== 'F12') { return }
      event.preventDefault()
      if (wc.isDevToolsOpened()) { wc.closeDevTools() }
      else { wc.openDevTools(docked ? undefined : { mode: 'detach' }) }
    })
  }

  /** 启动外观与布局参数：主窗与 plane 共用（preload readBootAppearance 按序解析），缺一份则该窗落缺省主题 */
  private bootArguments(): string[] {
    const chrome = effectiveChrome(this.flavor)
    return [
      `--shell-accent=${this.initialAccent}`,
      `--shell-theme=${this.initialTheme}`,
      // 布局档位同步定型：solo 档无接缝底板，异步获取会让视图容器矩形首报落空
      `--shell-chrome=${chrome}`,
      // 启动握手只对 solo 直出（清单恰一个应用）生效：platform 撤层不必等应用，避免门闩悬空
      ...(chrome === 'solo' && this.flavor.apps.length === 1 ? ['--shell-intro-gate=app'] : []),
    ]
  }

  /** 工作台主窗：tab 条 + 左导航的产品主体 */
  createShellWindow(): BrowserWindow {
    const mode = this.flavor.mode === 'kiosk' ? createKioskMode() : createWindowedMode()
    const win = new BrowserWindow({
      ...shellBase,
      width: 1280,
      height: 800,
      // shell 桥必须注入：preload 与 main/preload 产物同层（out/preload/index.cjs）。
      // 沙箱保持 shellBase 的 true——preload 只用 contextBridge/ipcRenderer（白名单内）+
      // 全局 process.argv，CJS 产物下沙箱可用，勿因 ESM preload 而关沙箱
      webPreferences: {
        ...shellBase.webPreferences,
        preload: join(this.rendererDir, '../preload/index.cjs'),
        // 启动外观：同步随 preload 抵达，渲染层挂载前即可应用（零闪烁；不走异步 IPC）
        additionalArguments: this.bootArguments(),
      },
    })
    mode.enter(win)

    // 生产：加载本地产物；dev：electron-vite 注入 ELECTRON_RENDERER_URL
    const devUrl = process.env.ELECTRON_RENDERER_URL
    if (devUrl) { void win.loadURL(devUrl) }
    else { void win.loadFile(join(this.rendererDir, 'index.html')) }

    // 数据先行：窗口保持隐藏直至首帧已绘（ready-to-show）——磨砂材质随窗口可见
    // 即时生效，上屏首帧即「磨砂 + LOGO」完整帧；材质初始化与求值的黑帧间隙都在
    // 窗口可见之前，屏幕上不可见。加载失败兜底 show，窗口不缺席。
    let paintedOnce = false
    win.once('ready-to-show', () => {
      paintedOnce = true
      win.show()
      win.webContents.send('shell:introBegin')
    })
    win.webContents.once('did-fail-load', () => {
      if (!win.isDestroyed() && !win.isVisible()) { win.show() }
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
    this.installDevToolsShortcut(win.webContents, true)
    // 从最小化/隐藏恢复时重放工作区：系统可能丢弃恢复前施加的 view bounds
    win.on('restore', () => this.replayContentRect())
    win.on('show', () => this.replayContentRect())
    // plane 几何恒等于内容区：窗口尺寸变化即跟随（零计算，无锚定测量）
    win.on('resize', () => {
      const w = this.shellWindow
      if (w) { this.plane?.setBounds(w.getContentBounds()) }
    })
    this.shellWindowId = win.id
    this.createPlane()
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
      // plane 不入 windows 账本（独立生命周期管理），广播需显式送达
      if (this.plane && !this.plane.isDestroyed()) { this.plane.webContents.send(`event:${name}`, payload) }
    })
  }

  // ── 通知平面（plane）：常驻全屏透明子窗，承载全部浮层表面（OverlayCenter 管理）─

  private plane?: BrowserWindow
  /** plane 是否持有焦点（权限 ESC / 面板输入依赖它；toast 独占时不持有） */
  private planeFocusHeld = false
  /** 穿透合成输入源：交互表面在列（快照决策）/ toast 悬停拦截（plane 上报） */
  private planeInteractive = false
  private planeHoverHeld = false

  /**
   * 通知平面：随主窗创建（透明全屏子窗，恒在父窗内容含应用视图之上）。穿透缺省开启。
   */
  createPlane(): void {
    const parent = this.shellWindow
    if (this.plane || !parent) { return }
    const area = parent.getContentBounds()
    const plane = new BrowserWindow({
      ...overlayBase,
      parent,
      width: area.width,
      height: area.height,
      show: false,
      webPreferences: {
        ...overlayBase.webPreferences,
        preload: join(this.rendererDir, '../preload/index.cjs'),
        // 与主窗同源的启动外观参数：缺了 preload 落缺省 theme=system，两窗主题源分叉
        additionalArguments: this.bootArguments(),
        partition: 'persist:overlay-window',
        backgroundThrottling: false,
      },
    })
    this.plane = plane
    // 初始穿透态经合成落位（空态全穿透），不裸调 setIgnoreMouseEvents
    this.applyPlaneMouseMode()
    // 恒可见：透明空态 + 穿透是惰性的，显隐只会冻结平面内 CSS 过渡
    // （transitionend 不触发 → 离场元素滞留 DOM → 下次显示叠出旧卡虚影）
    plane.showInactive()
    const hash = '#/overlay?kind=plane'
    const devUrl = process.env.ELECTRON_RENDERER_URL
    if (devUrl) { void plane.loadURL(`${devUrl}/${hash}`) }
    else { void plane.loadFile(join(this.rendererDir, 'index.html'), { hash: hash.replace(/^#/, '') }) }
    this.callers?.register(plane.webContents.id, { appId: SHELL_APP_ID, instanceId: 'overlay-plane', kind: 'overlay' })
    this.applySessionGuards(plane.webContents.session, 'all')
  }

  /** plane 恒全屏（几何零计算）；交互表面在列时接手键盘（权限 ESC / 面板检索） */
  focusPlane(): void {
    const plane = this.plane
    if (!plane || plane.isDestroyed()) { return }
    this.planeFocusHeld = true
    this.setPlaneInteractive(true)
    plane.focus()
  }

  blurPlane(): void {
    if (!this.planeFocusHeld) { return }
    this.planeFocusHeld = false
    this.setPlaneInteractive(false)
    this.restoreContentFocus()
  }

  /** toast 卡片悬停切换：穿透态下鼠标进卡片临时拦截，离开即交还 */
  setPlaneMouseIgnore(ignore: boolean): void {
    this.planeHoverHeld = !ignore
    this.applyPlaneMouseMode()
  }

  /** 快照穿透决策：交互表面在列恒收鼠标，toast 系穿透 */
  setPlaneInteractive(interactive: boolean): void {
    this.planeInteractive = interactive
    this.applyPlaneMouseMode()
  }

  /**
   * 穿透态单点合成：两个输入源（快照决策 / 悬停上报）各自更新、合并生效——
   * 悬停拦截生效期间任何快照推送（下载进度等高频事件）不得恢复穿透
   */
  private applyPlaneMouseMode(): void {
    const plane = this.plane
    if (!plane || plane.isDestroyed()) { return }
    plane.setIgnoreMouseEvents(!this.planeInteractive && !this.planeHoverHeld, { forward: true })
  }

  sendToPlane(channel: string, payload: unknown): void {
    if (this.plane && !this.plane.isDestroyed()) { this.plane.webContents.send(channel, payload) }
  }

  isPlaneSender(senderId: number): boolean {
    return this.plane?.webContents.id === senderId
  }

  /** 浮层宿主身份：拍摄预览帧通道与浮层内动作校验锚在 plane 页 */
  planeSurface(): { webContents: Electron.WebContents } | null {
    const plane = this.plane
    if (!plane || plane.isDestroyed()) { return null }
    return { webContents: plane.webContents }
  }

  /** plane 交还焦点：激活中的应用视图优先，否则回工作台 */
  private restoreContentFocus(): void {
    const win = this.shellWindow
    if (!win || win.isDestroyed()) { return }
    win.focus()
    const view = this.activeViewId ? this.views.get(this.activeViewId) : undefined
    if (view && view.getVisible() && !view.webContents.isDestroyed()) { view.webContents.focus() }
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
    // 不设视图底色：显式品牌色会在视图显形瞬间闪一帧蓝，Chromium 缺省白与中性垫场同调
    this.views.set(spec.instanceId, view)
    win.contentView.addChildView(view)
    view.setVisible(false)

    const { webContents } = view
    this.installDevToolsShortcut(webContents, false)
    this.callers?.register(webContents.id, { appId: spec.appId, instanceId: spec.instanceId, kind: 'view' })
    this.applySessionGuards(webContents.session, spec.permissions ?? [])

    // 加载状态广播：渲染层据此切换垫场（loading）与失败兜底（failed）；失败不再展开
    // Chromium 白错误页，交互出口由渲染层重试承接。
    // 必须先挂监听再 loadURL——did-start-loading 在 loadURL 调用内即刻触发，后挂监听永远错过
    webContents.on('did-start-loading', () => {
      this.failedViews.delete(spec.instanceId)
      this.events?.emit('tabs.state-changed', { instanceId: spec.instanceId, action: 'loading-started' })
    })
    webContents.on('did-stop-loading', () => {
      this.events?.emit('tabs.state-changed', { instanceId: spec.instanceId, action: 'loading-finished' })
    })
    webContents.on('did-fail-load', (_event, _code, _desc, _url, isMainFrame) => {
      if (!isMainFrame) { return }
      this.failedViews.add(spec.instanceId)
      this.events?.emit('tabs.state-changed', { instanceId: spec.instanceId, action: 'load-failed' })
    })
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
    // 不变量「激活外全隐藏」必须在此强制维持：只藏前任激活视图会漏掉加载竞态
    // reveal 抢跑与漏 deactivate 留下的可见残影——残影保留旧激活期 bounds，新视图
    // 盖不到其底边，切换应用时在窗口底部露出一条旧页面
    for (const [id, v] of this.views) {
      if (id !== instanceId && !v.webContents.isDestroyed()) { v.setVisible(false) }
    }
    this.activeViewId = instanceId
    // 全屏中的视图切回时铺满整窗（期间窗口处于 OS 全屏），否则按工作区矩形落位
    view.setBounds(this.htmlFullscreen === instanceId ? win.getContentBounds() : this.contentRect)
    // 垫场纪律：页面未加载完成不露页（渲染层垫场透出），失败视图也不展开（渲染层失败
    // 兜底承接交互出口），加载完成且仍是激活实例才显示
    if (view.webContents.isLoading() || this.failedViews.has(instanceId)) {
      view.setVisible(false)
      const reveal = (): void => {
        if (this.activeViewId === instanceId && !this.failedViews.has(instanceId)) { view.setVisible(true) }
      }
      view.webContents.once('did-finish-load', reveal)
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
    this.failedViews.delete(instanceId)
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
    this.installDevToolsShortcut(win.webContents, false)
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
    const win = this.shellWindow
    if (!win) { return }
    // plane 几何恒等于内容区，恢复时同样可能被系统丢弃，先重放
    this.plane?.setBounds(win.getContentBounds())
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
