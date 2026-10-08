import type { DownloadTask, OverlaySyncState, PermissionRequest, PlatformNotification, TabContextMenu } from '@desktop/shared'
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
/** Shell 顶栏高度（TopBar 40px）：消息窗从顶栏之下开始，不遮挡顶部导航 */
const TOPBAR_HEIGHT = 40
/** 通知 toast 自动消失时长（ms）：太短用户容易错过 */
const TOAST_TTL_MS = 8000
/** 下载卡片终态自动消失时长：与通知 toast 同款体验（进行中的任务常驻展示进度） */
const DOWNLOAD_TTL_MS = TOAST_TTL_MS
/** 弹窗清场到隐藏的间隔（ms）：等浮层页绘制完透明空帧再 hide，2-3 帧足够，留余量 */
const OVERLAY_CLEAR_DELAY_MS = 100

/**
 * 浮层窗口服务：独立透明无边框 BrowserWindow 承载全局浮层。
 * WebContentsView 是原生合成层，永远盖在 Shell DOM 之上——必须盖住 Web 容器区域的
 * 浮层（消息区、授权弹窗、Tab 右键菜单）只能走原生窗口；原生窗承载菜单的同时
 * 让页面内容保持可见（无需视图抑制）。Shell 域内浮层不再有别的入口。
 *
 * 三类浮层窗（均懒创建、复用，hide 不销毁，挂 parent 常驻主窗口之上）：
 * - panel  右下角消息区（下载通知卡 + 通知 toast）：showInactive 不抢焦点，无内容自动隐藏
 * - dialog 权限弹窗：全屏遮罩模态（窗口铺满主窗内容区，遮罩 + 居中卡片由页面绘制），
 *   用户决策 / 超时 / App 关闭后同步移除
 * - menu   Tab 右键菜单：全屏透明模态（透明层拦截点击 + 锚点处菜单卡由页面绘制），
 *   选中 / ESC / 点击菜单外关闭，页面内容全程可见
 *
 * panel 内容高度动态：页面渲染后经 overlay:resize 量高回报，Main 据此调整窗口；
 * dialog / menu 尺寸由 Main 直接确定（全屏铺开），无需回报。
 */
export class OverlayWindowService {
  private panelWin: BrowserWindow | null = null
  private dialogWin: BrowserWindow | null = null
  private menuWin: BrowserWindow | null = null

  /** 右下角消息区数据源（Main 持有，窗口复用时全量重推） */
  private toasts: PlatformNotification[] = []
  private readonly toastTimers = new Map<string, NodeJS.Timeout>()
  private downloads: DownloadTask[] = []
  /** 已被用户手动关闭的下载卡片 id：任务仍在服务列表中（保留 30s），按 id 隐藏不再展示 */
  private readonly dismissedDownloads = new Set<string>()
  /** 下载终态卡片的自动消失计时器：与通知 toast 同款 8s 自动消失 */
  private readonly downloadTtlTimers = new Map<string, NodeJS.Timeout>()
  /** 挂起中的运行时授权请求（dialog 窗数据源） */
  private dialogs: PermissionRequest[] = []
  /** 挂起中的 Tab 右键菜单（menu 窗数据源） */
  private menu: TabContextMenu | null = null
  /** 清场隐藏延迟器：空帧绘制落地后再 hide；期间来了新请求则取消（窗口保持可见） */
  private dialogHideTimer: NodeJS.Timeout | null = null
  /** 菜单窗清场隐藏延迟器（与 dialogHideTimer 同策略，窗口独立互不影响） */
  private menuHideTimer: NodeJS.Timeout | null = null
  /** 菜单实例序号：生成菜单 id */
  private menuSeq = 0

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
    // 终态任务起 TTL 计时器：与通知 toast 一致的自动消失
    for (const task of tasks) {
      if (task.status !== 'progressing' && !this.dismissedDownloads.has(task.id) && !this.downloadTtlTimers.has(task.id)) {
        this.downloadTtlTimers.set(
          task.id,
          setTimeout(() => {
            this.downloadTtlTimers.delete(task.id)
            this.dismissedDownloads.add(task.id)
            this.refreshPanel()
          }, DOWNLOAD_TTL_MS),
        )
      }
    }
    // 已从服务列表消失的任务（服务保留期结束清理）：同步收计时器与隐藏记录，防集合无限增长
    const liveIds = new Set(tasks.map(task => task.id))
    for (const [id, timer] of this.downloadTtlTimers) {
      if (!liveIds.has(id)) {
        clearTimeout(timer)
        this.downloadTtlTimers.delete(id)
      }
    }
    for (const id of this.dismissedDownloads) {
      if (!liveIds.has(id))
        this.dismissedDownloads.delete(id)
    }
    this.refreshPanel()
  }

  /** 用户手动关闭单条下载卡片：仅隐藏展示，不影响任务本身 */
  dismissDownload(taskId: string): void {
    this.dismissedDownloads.add(taskId)
    this.refreshPanel()
  }

  // ---- 权限弹窗 ----

  /** 运行时授权请求入列：全屏遮罩模态弹出，请用户决策 */
  pushDialog(request: PermissionRequest): void {
    if (this.dialogs.some(item => item.requestId === request.requestId))
      return
    this.dialogs.push(request)
    // 清场隐藏还没落地就有新请求：取消延迟隐藏，窗口保持可见，卡片原地换新（key 变化重播入场动画）
    if (this.dialogHideTimer) {
      clearTimeout(this.dialogHideTimer)
      this.dialogHideTimer = null
    }
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
    if (!this.dialogWin)
      return
    if (!this.dialogs.length) {
      // 清场先行：先推空列表让浮层页在可见状态下移除卡片并绘制一帧透明画面，再隐藏窗口。
      // 直接 hide 的话窗口缓冲区最后一帧是旧卡片（隐藏文档不再渲染，清卡片的绘制不会发生），
      // 下次 show 瞬间会先合成残留帧——卡片「瞬间出现」后又闪回复播入场动画，
      // 即「第一次正常、之后只是显示隐藏」的观感。与 refreshPanel 隐藏前清空页面状态同一策略。
      this.dialogWin.webContents.send('permission:pending', [])
      this.dialogHideTimer = setTimeout(() => {
        this.dialogHideTimer = null
        this.dialogWin?.hide()
      }, OVERLAY_CLEAR_DELAY_MS)
      return
    }
    this.applyDialogBounds()
    this.dialogWin.webContents.send('permission:pending', this.dialogs)
  }

  /** 弹窗窗全屏遮罩：窗口铺满主窗口内容区，遮罩与居中卡片由页面绘制（模态语义，遮罩区拦截点击） */
  private applyDialogBounds(): void {
    this.applyFullscreenBounds(this.dialogWin)
  }

  /** 全屏铺开通用：浮层窗铺满主窗口内容区（dialog 遮罩 / menu 拦截层共用） */
  private applyFullscreenBounds(win: BrowserWindow | null): void {
    const parent = this.getParent()
    if (!parent || !win)
      return
    const content = parent.getContentBounds()
    win.setBounds({ x: content.x, y: content.y, width: content.width, height: content.height })
  }

  // ---- Tab 右键菜单 ----

  /** Shell 发起：打开 Tab 右键菜单（原生浮层窗承载，页面内容保持可见） */
  pushMenu(input: { tabId: string, appId: string, x: number, y: number }): void {
    // 清场隐藏还没落地就有新菜单：取消延迟隐藏，窗口保持可见，卡片原地换新
    if (this.menuHideTimer) {
      clearTimeout(this.menuHideTimer)
      this.menuHideTimer = null
    }
    this.menu = { id: `ctx-${++this.menuSeq}`, ...input }
    const win = this.ensureMenu()
    this.applyFullscreenBounds(win)
    // 数据先行：页面在窗口隐藏状态下渲染就绪，show 瞬间即有菜单（与 pushDialog 同策略）
    win.webContents.send('overlay:menuPending', this.menu)
    if (!win.isVisible())
      win.show()
    win.focus()
  }

  /** 关闭菜单（选中动作由 IPC 层执行后调用；ESC / 点击菜单外也走这里） */
  dismissMenu(): void {
    if (!this.menu)
      return
    this.menu = null
    if (!this.menuWin)
      return
    // 清场先行：推空让页面在可见状态下移除菜单卡并绘制透明帧，再隐藏（防残留帧，同 resolveDialog）
    this.menuWin.webContents.send('overlay:menuPending', null)
    this.menuHideTimer = setTimeout(() => {
      this.menuHideTimer = null
      this.menuWin?.hide()
    }, OVERLAY_CLEAR_DELAY_MS)
  }

  /** 当前挂起菜单（IPC 层执行选中动作时取 tabId / appId） */
  getMenu(): TabContextMenu | null {
    return this.menu
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
      return { toasts: this.toasts, downloads: this.downloads, dialogs: [], menu: null }
    if (this.dialogWin?.webContents === sender)
      return { toasts: [], downloads: [], dialogs: this.dialogs, menu: null }
    if (this.menuWin?.webContents === sender)
      return { toasts: [], downloads: [], dialogs: [], menu: this.menu }
    return { toasts: [], downloads: [], dialogs: [], menu: null }
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
      this.ensureMenu()
    }
    catch (error) {
      this.logger.warn('overlay prewarm failed', { error: String(error) })
    }
  }

  /** 来源校验：仅浮层窗口自身可回传动作 / 决策，防止其他 renderer 伪造 */
  isOverlay(sender: WebContents): boolean {
    return this.panelWin?.webContents === sender
      || this.dialogWin?.webContents === sender
      || this.menuWin?.webContents === sender
  }

  // ---- 内部：消息区 ----

  private removeToast(id: string): void {
    this.toastTimers.delete(id)
    this.toasts = this.toasts.filter(item => item.id !== id)
    this.refreshPanel()
  }

  private refreshPanel(): void {
    // 展示过滤：手动关闭 / 已过 TTL 的下载卡片不再推送（任务本身仍在服务列表中）
    const visibleDownloads = this.downloads.filter(task => !this.dismissedDownloads.has(task.id))
    if (!this.toasts.length && !visibleDownloads.length) {
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
    win.webContents.send('download:updated', visibleDownloads)
    if (!win.isVisible()) {
      // 默认整窗穿透，页面按命中元素切换（避免透明区遮挡下层页面点击）
      win.setIgnoreMouseEvents(true, { forward: true })
      win.showInactive()
      // Windows 上 hide 过的 owned 窗 showInactive 可能不回到前台：补一次置顶
      win.moveTop()
    }
  }

  /**
   * 消息窗右上角锚定：对齐主窗口内容区右上角，顶部让出 Shell 顶栏（40px），
   * 高度钳制在顶栏之下到内容区底边之间（浮层是主窗口的子窗，只允许出现在软件窗口范围内）。
   */
  private anchorPanel(parent: BrowserWindow, height: number): Electron.Rectangle {
    const content = parent.getContentBounds()
    const width = PANEL_WIDTH + SHADOW * 2
    const x = content.x + content.width - width - SCREEN_MARGIN
    const y = content.y + TOPBAR_HEIGHT + SCREEN_MARGIN
    const clampedHeight = Math.min(height, content.height - TOPBAR_HEIGHT - SCREEN_MARGIN * 2)
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

  private ensureMenu(): BrowserWindow {
    if (this.menuWin)
      return this.menuWin
    const parent = this.getParent()
    if (!parent)
      throw new Error('[overlay] main window is not ready')
    const win = this.createOverlayWindow(parent)
    // 菜单不因失焦消失（全屏透明模态）：挂起菜单由 Main 统一管理（选中 / ESC / 点击菜单外）
    this.menuWin = win
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
    // closed 时窗口已销毁，届时访问 win.webContents 会抛 Object has been destroyed——
    // 存活期先取好 webContents 与 id
    const wc = win.webContents
    const wcId = wc.id
    win.on('closed', () => {
      if (this.panelWin === win)
        this.panelWin = null
      if (this.dialogWin === win)
        this.dialogWin = null
      if (this.menuWin === win)
        this.menuWin = null
      this.resolver.unregister(wcId)
    })
    // 浮层页以 Shell 身份登记：permission:respond 等决策回传通道经 assertShell 放行
    this.resolver.register(wc, { appId: SHELL_APP_ID, instanceId: `overlay-${win.id}` })

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
