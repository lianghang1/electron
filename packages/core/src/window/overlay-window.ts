import type { DownloadTask, OverlayMenuConfig, OverlaySyncState, PermissionRequest, PlatformNotification } from '@desktop/shared'
import type { WebContents } from 'electron'
import type { CallerResolver } from '../ipc/caller-context'
import type { Logger } from '../logger/logger'
import { join } from 'node:path'
import process from 'node:process'
import { is } from '@electron-toolkit/utils'
import { BrowserWindow, screen } from 'electron'
import { SHELL_APP_ID } from '../constants'

/** 菜单窗口几何常量（DIP）：与 OverlayApp.vue 的渲染尺寸一一对应 */
const MENU_WIDTH = 180
const MENU_PADDING = 4
const ITEM_HEIGHT = 28
const SEPARATOR_HEIGHT = 9
/** 窗口四周的阴影/圆角余量：透明窗会硬裁超出窗口位图的内容，box-shadow 必须留出空间 */
const SHADOW = 12
/** 右下角消息窗（下载浮窗 + 通知 toast）内容宽度，与 OverlayApp.vue 一致 */
const PANEL_WIDTH = 320
/** 权限弹窗窗内容宽度，与 OverlayApp.vue 一致 */
const DIALOG_WIDTH = 400
/** 浮层窗到屏幕工作区边缘的最小间距 */
const SCREEN_MARGIN = 8
/** 通知 toast 自动消失时长（ms） */
const TOAST_TTL_MS = 5000

/**
 * 浮层窗口服务：独立透明无边框 BrowserWindow 承载全局浮层。
 * WebContentsView 是原生合成层，永远盖在 Shell DOM 之上——浮层只能走原生窗口才能压过它。
 *
 * 三类浮层窗（均懒创建、复用，hide 不销毁，挂 parent 常驻主窗口之上）：
 * - menu   菜单：锚点定位，失焦即收起
 * - panel  右下角消息区（下载浮窗 + 通知 toast）：showInactive 不抢焦点，无内容自动隐藏
 * - dialog 权限弹窗：屏幕居中，用户决策 / 超时 / App 关闭后同步移除
 *
 * panel / dialog 内容高度动态：页面渲染后经 overlay:resize 量高回报，Main 据此调整窗口。
 */
export class OverlayWindowService {
  private menuWin: BrowserWindow | null = null
  private panelWin: BrowserWindow | null = null
  private dialogWin: BrowserWindow | null = null
  /** 当前展示中的菜单配置：菜单页 sync 的数据源，也是窗口就绪前到达请求的兜底 */
  private menuConfig: OverlayMenuConfig | null = null

  /** 右下角消息区数据源（Main 持有，窗口复用时全量重推） */
  private toasts: PlatformNotification[] = []
  private readonly toastTimers = new Map<string, NodeJS.Timeout>()
  private downloads: DownloadTask[] = []
  /** 挂起中的运行时授权请求（dialog 窗数据源） */
  private dialogs: PermissionRequest[] = []

  constructor(
    private readonly getParent: () => BrowserWindow | undefined,
    private readonly resolver: CallerResolver,
    private readonly logger: Logger,
  ) {}

  // ---- 菜单 ----

  /** Shell 发起：在视口坐标处弹出菜单（坐标在此换算为屏幕坐标并钳制到工作区） */
  showMenu(config: OverlayMenuConfig): void {
    const parent = this.getParent()
    if (!parent) {
      this.logger.warn('overlay showMenu skipped: main window not found')
      return
    }
    const win = this.ensureMenu(parent)
    // 菜单内容高度 = 上下内边距 + 条目 + 分隔线；窗口在四周各加 SHADOW 余量承载阴影
    const separators = config.items.filter(item => item.separatorBefore).length
    const menuHeight = MENU_PADDING * 2 + config.items.length * ITEM_HEIGHT + separators * SEPARATOR_HEIGHT
    win.setBounds(this.clampToWorkArea(parent, MENU_WIDTH + SHADOW * 2, menuHeight + SHADOW * 2, config.x, config.y))
    if (!win.isVisible())
      win.show()
    else win.focus()
    // 页面未 mounted（首次调用时才创建）也不丢配置：mounted 后页面经 overlay:sync 拉取
    this.menuConfig = config
    win.webContents.send('overlay:show', config)
  }

  hide(): void {
    this.menuWin?.hide()
  }

  // ---- 右下角消息区（下载浮窗 + 通知 toast） ----

  /** 平台通知入列：超时自动移除，窗口无内容时隐藏 */
  pushToast(notification: PlatformNotification): void {
    this.toasts.push(notification)
    this.toastTimers.set(
      notification.id,
      setTimeout(() => this.removeToast(notification.id), TOAST_TTL_MS),
    )
    this.refreshPanel()
  }

  /** 下载任务状态更新：无任务时窗口隐藏 */
  setDownloads(tasks: DownloadTask[]): void {
    this.downloads = tasks
    this.refreshPanel()
  }

  // ---- 权限弹窗 ----

  /** 运行时授权请求入列：弹窗居中弹出，请用户决策 */
  pushDialog(request: PermissionRequest): void {
    if (this.dialogs.some(item => item.requestId === request.requestId))
      return
    this.dialogs.push(request)
    const win = this.ensureDialog()
    this.applyDialogBounds()
    if (!win.isVisible())
      win.show()
    win.focus()
    // 初始状态由页面 mounted 后 overlay:sync 主动拉取；这里的推送面向后续变化
    win.webContents.send('permission:pending', this.dialogs)
  }

  /** 请求已结束（用户决策 / 超时 / App 关闭作废）：同步移除弹窗卡片 */
  resolveDialog(requestId: string): void {
    if (!this.dialogs.some(item => item.requestId === requestId))
      return
    this.dialogs = this.dialogs.filter(item => item.requestId !== requestId)
    if (!this.dialogs.length) {
      this.dialogWin?.hide()
      return
    }
    if (!this.dialogWin)
      return
    this.applyDialogBounds()
    this.dialogWin.webContents.send('permission:pending', this.dialogs)
  }

  /** 弹窗窗居中重定位（内容高度取当前窗口高，页面量高回报后再校准） */
  private applyDialogBounds(): void {
    const parent = this.getParent()
    const win = this.dialogWin
    if (!parent || !win)
      return
    win.setBounds(this.centerDialog(parent, win.getBounds().height))
  }

  // ---- 浮层页回调 ----

  /** 浮层页面量高回报：按 sender 分发到对应浮层窗，重设窗口尺寸与锚定位置 */
  applyResize(sender: WebContents, height: number): void {
    if (!Number.isFinite(height) || height <= 0)
      return
    const parent = this.getParent()
    if (!parent)
      return
    if (this.panelWin?.webContents === sender) {
      this.panelWin.setBounds(this.anchorPanel(parent, height))
    }
    else if (this.dialogWin?.webContents === sender) {
      this.dialogWin.setBounds(this.centerDialog(parent, height))
    }
  }

  /** 浮层页 mounted 后主动拉取当前状态（杜绝 Main 推送早于页面订阅的竞态） */
  syncState(): OverlaySyncState {
    return { menu: this.menuConfig, toasts: this.toasts, downloads: this.downloads, dialogs: this.dialogs }
  }

  /** Shell（主）窗口：浮层用户动作的转发目标 */
  getShellWindow(): BrowserWindow | undefined {
    return this.getParent()
  }

  /** 来源校验：仅浮层窗口自身可回传动作 / 决策，防止其他 renderer 伪造 */
  isOverlay(sender: WebContents): boolean {
    return this.menuWin?.webContents === sender
      || this.panelWin?.webContents === sender
      || this.dialogWin?.webContents === sender
  }

  // ---- 内部：消息区 ----

  private removeToast(id: string): void {
    this.toastTimers.delete(id)
    this.toasts = this.toasts.filter(item => item.id !== id)
    this.refreshPanel()
  }

  private refreshPanel(): void {
    if (!this.toasts.length && !this.downloads.length) {
      this.panelWin?.hide()
      return
    }
    const parent = this.getParent()
    if (!parent)
      return
    const win = this.ensurePanel(parent)
    win.setBounds(this.anchorPanel(parent, win.getBounds().height))
    if (!win.isVisible())
      win.showInactive()
    // 初始状态由页面 mounted 后 overlay:sync 主动拉取；这里的推送面向后续变化
    win.webContents.send('notification:received', this.toasts)
    win.webContents.send('download:updated', this.downloads)
  }

  /** 消息窗右下角锚定：内容高度由页面回报，先按当前窗口高度贴底，回报后再校准 */
  private anchorPanel(parent: BrowserWindow, height: number): Electron.Rectangle {
    const content = parent.getContentBounds()
    const width = PANEL_WIDTH + SHADOW * 2
    return {
      x: Math.round(content.x + content.width - width - SCREEN_MARGIN),
      y: Math.round(content.y + content.height - height - SCREEN_MARGIN),
      width,
      height,
    }
  }

  /** 权限弹窗屏幕居中 */
  private centerDialog(parent: BrowserWindow, height: number): Electron.Rectangle {
    const content = parent.getContentBounds()
    const width = DIALOG_WIDTH + SHADOW * 2
    return {
      x: Math.round(content.x + (content.width - width) / 2),
      y: Math.round(content.y + (content.height - height) / 2),
      width,
      height,
    }
  }

  // ---- 内部：窗口创建 ----

  private ensureMenu(parent: BrowserWindow): BrowserWindow {
    if (this.menuWin)
      return this.menuWin
    const win = this.createOverlayWindow(parent)
    // 失焦即收起：点击菜单外任意位置（焦点回到主窗口）都算关闭
    win.on('blur', () => win.hide())

    const devUrl = process.env.ELECTRON_RENDERER_URL
    const load
      = is.dev && devUrl
        ? win.loadURL(`${devUrl}#/overlay`)
        : win.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/overlay' })
    void load.catch((error) => {
      this.logger.error('failed to load overlay renderer', { error: String(error) })
    })

    this.menuWin = win
    return win
  }

  private ensurePanel(parent: BrowserWindow): BrowserWindow {
    if (this.panelWin)
      return this.panelWin
    const win = this.createOverlayWindow(parent)
    // 消息窗不抢焦点（showInactive），常驻到内容清空后由 refreshPanel 隐藏
    this.panelWin = win
    return win
  }

  private ensureDialog(): BrowserWindow {
    if (this.dialogWin)
      return this.dialogWin
    const parent = this.getParent()
    if (!parent)
      throw new Error('[overlay] main window is not ready')
    const win = this.createOverlayWindow(parent)
    // 决策弹窗不因失焦消失：挂起请求由 Main 统一管理（决策 / 30s 超时 / App 关闭）
    this.dialogWin = win
    return win
  }

  /** 浮层窗公共底座：透明无边框、不进任务栏；注册 Shell 身份供决策回传通道校验 */
  private createOverlayWindow(parent: BrowserWindow): BrowserWindow {
    const win = new BrowserWindow({
      width: 100,
      height: 0,
      show: false,
      frame: false,
      transparent: true,
      hasShadow: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      parent,
      webPreferences: {
        preload: join(__dirname, '../preload/index.cjs'),
        sandbox: true,
        contextIsolation: true,
      },
    })
    win.setMenu(null)
    win.on('closed', () => {
      if (this.menuWin === win) {
        this.menuWin = null
        this.menuConfig = null
      }
      if (this.panelWin === win)
        this.panelWin = null
      if (this.dialogWin === win)
        this.dialogWin = null
      this.resolver.unregister(win.webContents)
    })
    // 浮层页以 Shell 身份登记：permission:respond 等决策回传通道经 assertShell 放行
    this.resolver.register(win.webContents, { appId: SHELL_APP_ID, instanceId: `overlay-${win.id}` })

    const devUrl = process.env.ELECTRON_RENDERER_URL
    const load
      = is.dev && devUrl
        ? win.loadURL(`${devUrl}#/overlay`)
        : win.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/overlay' })
    void load.catch((error) => {
      this.logger.error('failed to load overlay renderer', { error: String(error) })
    })
    return win
  }

  /** 视口坐标 → 屏幕坐标（页面 (0,0) 即主窗口内容区左上角），并钳制到所在屏幕工作区 */
  private clampToWorkArea(parent: BrowserWindow, width: number, height: number, vx: number, vy: number): Electron.Rectangle {
    const content = parent.getContentBounds()
    // 菜单本体从余量处开始绘制：锚点按视口坐标落位，窗口原点向左上各退一个余量
    let x = content.x + vx - SHADOW
    let y = content.y + vy - SHADOW
    const workArea = screen.getDisplayNearestPoint({ x, y }).workArea
    x = Math.min(Math.max(x, workArea.x + SCREEN_MARGIN), workArea.x + workArea.width - width - SCREEN_MARGIN)
    y = Math.min(Math.max(y, workArea.y + SCREEN_MARGIN), workArea.y + workArea.height - height - SCREEN_MARGIN)
    return { x: Math.round(x), y: Math.round(y), width, height }
  }
}
