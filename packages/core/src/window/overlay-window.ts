import type { DownloadTask, OverlaySyncState, PermissionRequest, PlatformNotification } from '@desktop/shared'
import type { WebContents } from 'electron'
import type { CallerResolver } from '../ipc/caller-context'
import type { Logger } from '../logger/logger'
import { join } from 'node:path'
import process from 'node:process'
import { is } from '@electron-toolkit/utils'
import { BrowserWindow } from 'electron'
import { SHELL_APP_ID } from '../constants'

/** 右下角消息窗（下载浮窗 + 通知 toast）内容宽度，与 OverlayApp.vue 一致 */
const PANEL_WIDTH = 320
/** 窗口四周的阴影/圆角余量：透明窗会硬裁超出窗口位图的内容，box-shadow 必须留出空间 */
const SHADOW = 12
/** 浮层窗到屏幕工作区边缘的最小间距 */
const SCREEN_MARGIN = 8
/** 通知 toast 自动消失时长（ms）：太短用户容易错过 */
const TOAST_TTL_MS = 8000

/**
 * 浮层窗口服务：独立透明无边框 BrowserWindow 承载全局浮层。
 * WebContentsView 是原生合成层，永远盖在 Shell DOM 之上——必须盖住 Web 容器区域的
 * 浮层（消息区、授权弹窗）只能走原生窗口才能压过它；Shell 域内浮层（Tab 右键菜单）
 * 在 Shell DOM 渲染（reka-ui）并配合视图抑制，不经过浮层窗。
 *
 * 两类浮层窗（均懒创建、复用，hide 不销毁，挂 parent 常驻主窗口之上）：
 * - panel  右下角消息区（下载浮窗 + 通知 toast）：showInactive 不抢焦点，无内容自动隐藏
 * - dialog 权限弹窗：全屏遮罩模态（窗口铺满主窗内容区，遮罩 + 居中卡片由页面绘制），
 *   用户决策 / 超时 / App 关闭后同步移除
 *
 * panel 内容高度动态：页面渲染后经 overlay:resize 量高回报，Main 据此调整窗口；
 * dialog 尺寸由 Main 直接确定，无需回报。
 */
export class OverlayWindowService {
  private panelWin: BrowserWindow | null = null
  private dialogWin: BrowserWindow | null = null

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

  /** 用户手动关闭单条通知（面板内滑动 / 关闭按钮回传）：与超时移除同一出口 */
  dismissToast(id: string): void {
    this.removeToast(id)
  }

  /** 下载任务状态更新：无任务时窗口隐藏 */
  setDownloads(tasks: DownloadTask[]): void {
    this.downloads = tasks
    this.refreshPanel()
  }

  // ---- 权限弹窗 ----

  /** 运行时授权请求入列：全屏遮罩模态弹出，请用户决策 */
  pushDialog(request: PermissionRequest): void {
    if (this.dialogs.some(item => item.requestId === request.requestId))
      return
    this.dialogs.push(request)
    const win = this.ensureDialog()
    this.applyDialogBounds()
    // 数据先行：页面在窗口隐藏状态下渲染就绪，show 瞬间即有内容——
    // 否则先显一帧空白窗再上遮罩，视觉「闪一下像显示了两次」
    win.webContents.send('permission:pending', this.dialogs)
    if (!win.isVisible())
      win.show()
    win.focus()
    this.logger.info('permission dialog shown', {
      appId: request.appId,
      permission: request.permission,
      pending: this.dialogs.length,
      bounds: JSON.stringify(win.getBounds()),
      visible: win.isVisible(),
    })
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

  /** 弹窗窗全屏遮罩：窗口铺满主窗口内容区，遮罩与居中卡片由页面绘制（模态语义，遮罩区拦截点击） */
  private applyDialogBounds(): void {
    const parent = this.getParent()
    const win = this.dialogWin
    if (!parent || !win)
      return
    const content = parent.getContentBounds()
    win.setBounds({ x: content.x, y: content.y, width: content.width, height: content.height })
  }

  // ---- 浮层页回调 ----

  /** 消息窗页面量高回报：重设右下角窗口尺寸与锚定位置（弹窗窗全屏铺开，无需回报） */
  applyResize(sender: WebContents, height: number): void {
    if (!Number.isFinite(height) || height <= 0)
      return
    const parent = this.getParent()
    if (!parent)
      return
    if (this.panelWin?.webContents === sender)
      this.panelWin.setBounds(this.anchorPanel(parent, height))
  }

  /** 用户主动关闭消息面板：清空通知（取消计时）并隐藏；下载展示由 downloadService.clearUI 清，新事件到达时重新弹出 */
  dismissPanel(sender: WebContents): void {
    if (this.panelWin?.webContents !== sender)
      return
    for (const timer of this.toastTimers.values())
      clearTimeout(timer)
    this.toastTimers.clear()
    this.toasts = []
    this.panelWin.webContents.send('notification:received', [])
    this.panelWin.hide()
  }

  /** 透明窗鼠标穿透开关（仅消息窗生效）：Windows 透明窗整个 bounds 都命中鼠标 */
  setPanelMouseIgnore(sender: WebContents, ignore: boolean): void {
    if (this.panelWin?.webContents !== sender)
      return
    this.panelWin.setIgnoreMouseEvents(ignore, { forward: true })
  }

  /**
   * 浮层页 mounted 后主动拉取当前状态（杜绝 Main 推送早于页面订阅的竞态）。
   * 按窗口身份分发：每类浮层窗只拉取自己承载的数据——否则 panel 窗会把挂起的
   * 权限请求也拉过来（在 320px 小窗里渲染全屏遮罩卡且无人清理，盖住 toast），
   * dialog 窗也会拉到 toast，跨窗状态污染。
   */
  syncFor(sender: WebContents): OverlaySyncState {
    if (this.panelWin?.webContents === sender)
      return { toasts: this.toasts, downloads: this.downloads, dialogs: [] }
    if (this.dialogWin?.webContents === sender)
      return { toasts: [], downloads: [], dialogs: this.dialogs }
    return { toasts: [], downloads: [], dialogs: [] }
  }

  /**
   * 预创建常驻浮层窗（主窗就绪后调用）：页面提前加载完成，
   * 首次弹出/授权弹窗即时呈现，消除懒创建的加载延迟（遮罩「PPT 卡顿感」的根源）。
   */
  prewarm(): void {
    const parent = this.getParent()
    if (!parent)
      return
    try {
      this.ensurePanel(parent)
      this.ensureDialog()
    }
    catch (error) {
      this.logger.warn('overlay prewarm failed', { error: String(error) })
    }
  }

  /** 来源校验：仅浮层窗口自身可回传动作 / 决策，防止其他 renderer 伪造 */
  isOverlay(sender: WebContents): boolean {
    return this.panelWin?.webContents === sender
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
      // 隐藏前同步清空页面状态（面板关闭/任务清空的推送在此收口）
      this.panelWin?.webContents.send('notification:received', [])
      this.panelWin?.webContents.send('download:updated', [])
      this.panelWin?.hide()
      return
    }
    const parent = this.getParent()
    if (!parent)
      return
    const win = this.ensurePanel(parent)
    win.setBounds(this.anchorPanel(parent, win.getBounds().height))
    // 数据先行（与 pushDialog 同策略）：页面在隐藏状态渲染就绪后再显窗，避免首显空白帧
    win.webContents.send('notification:received', this.toasts)
    win.webContents.send('download:updated', this.downloads)
    if (!win.isVisible()) {
      // 默认整窗穿透，页面按命中元素切换（避免透明区遮挡下层页面点击）
      win.setIgnoreMouseEvents(true, { forward: true })
      win.showInactive()
      // Windows 上 hide 过的 owned 窗 showInactive 可能不回到前台：补一次置顶
      win.moveTop()
    }
  }

  /**
   * 消息窗右上角锚定：对齐主窗口内容区右上角，高度钳制在内容区内
   * （浮层是主窗口的子窗，只允许出现在软件窗口范围内——超出内容区会盖到别的应用上）。
   */
  private anchorPanel(parent: BrowserWindow, height: number): Electron.Rectangle {
    const content = parent.getContentBounds()
    const width = PANEL_WIDTH + SHADOW * 2
    const x = content.x + content.width - width - SCREEN_MARGIN
    const y = content.y + SCREEN_MARGIN
    const clampedHeight = Math.min(height, content.height - SCREEN_MARGIN * 2)
    return { x: Math.round(x), y: Math.round(y), width, height: Math.round(clampedHeight) }
  }

  // ---- 内部：窗口创建 ----

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
    // 决策弹窗不因失焦消失（全屏遮罩模态）：挂起请求由 Main 统一管理（决策 / 30s 超时 / App 关闭）
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
}
