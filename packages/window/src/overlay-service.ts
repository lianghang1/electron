import type { EventBus, NotificationCenter, PlatformNotification, Startable } from '@shell/kernel'
import type { CaptureDialogSession, DownloadTask } from '@shell/shared'
import type { OverlayAction, OverlayKind } from '@shell/shared/ipc'
import type { WindowSystem } from './window-system'
import { shellHandle } from '@shell/bridge/handle'

export interface PermissionRequestView {
  requestId: string
  appId: string
  origin: string
  permission: string
}

export type CaptureSessionView = CaptureDialogSession

export interface MenuView {
  id: string
  tabId: string
  appId: string
  x: number
  y: number
  closable: boolean
}

export interface OverlayState {
  kind: OverlayKind
  params: Readonly<Record<string, string>>
  notifications: readonly PlatformNotification[]
  downloads: readonly DownloadTask[]
  permission: PermissionRequestView | null
  menu: MenuView | null
  capture: CaptureSessionView | null
  config: string | null
  appCenterOpen: boolean
  updatePrompt: string | null
}

// IPC 边界形状唯一真源在 @shell/shared ipc 契约；此处转发保持既有导出面稳定
export type { OverlayAction } from '@shell/shared/ipc'

export interface OverlayServiceOptions {
  windows: WindowSystem
  events: EventBus
  notifications: NotificationCenter
  /** 菜单动作回传给应用运行时；未注入时只关闭菜单 */
  onMenuAction?: (action: string, menu: MenuView) => void
  /** 拍摄会话关闭回传给设备域 */
  onCaptureClose?: (sessionId: string) => void
}

/** 清场延迟：先推空状态让浮层页绘制透明帧，再隐藏，防残留帧复播 */
const CLEAR_DELAY_MS = 100
/** 授权弹窗超时：无人值守形态不能永久挂起 */
const PERMISSION_TIMEOUT_MS = 30_000

/**
 * 统一原生浮层宿主（A2 实测：WebContentsView 会盖住壳内 DOM 浮层）。
 * 通知、下载卡、授权弹窗、拍摄会话、菜单、设置、命令面板、更新提示共用一个宿主，
 * 统一层级 / 锚定 / 焦点 / 鼠标穿透 / 清场；状态由 Main 持有，浮层页 mounted 主动 sync。
 */
export class OverlayService implements Startable {
  readonly name = 'overlay'
  private notifications: readonly PlatformNotification[] = []
  private downloads: readonly DownloadTask[] = []
  private permission: PermissionRequestView | null = null
  private menu: MenuView | null = null
  private capture: CaptureSessionView | null = null
  private config: string | null = null
  private appCenterOpen = false
  private updatePrompt: string | null = null
  private readonly pendingPermissions = new Map<string, (granted: boolean) => void>()
  private readonly clearTimers = new Map<OverlayKind, NodeJS.Timeout>()
  private readonly unsubscribers: (() => void)[] = []
  private seq = 0

  constructor(private readonly options: OverlayServiceOptions) {
    this.registerIpc()
  }

  async start(): Promise<void> {
    this.unsubscribers.push(this.options.events.on('notification.updated', ({ items }) => {
      this.notifications = items
      this.refreshPanel()
    }))
    this.unsubscribers.push(this.options.events.on('download.tasks-changed', ({ tasks }) => {
      this.downloads = tasks
      this.refreshPanel()
    }))
    this.options.windows.prewarmOverlays()
  }

  async stop(): Promise<void> {
    for (const off of this.unsubscribers) { off() }
    this.unsubscribers.length = 0
    for (const timer of this.clearTimers.values()) { clearTimeout(timer) }
    this.clearTimers.clear()
  }

  /** PermissionPrompt.ask 实现：打开原生授权弹窗，等待用户决策 / 超时（缺省拒绝） */
  requestPermission(request: Omit<PermissionRequestView, 'requestId'>): Promise<boolean> {
    const requestId = `p-${++this.seq}`
    this.permission = { ...request, requestId }
    const promise = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => this.resolvePermission(requestId, false), PERMISSION_TIMEOUT_MS)
      timer.unref?.()
      this.pendingPermissions.set(requestId, (granted) => {
        clearTimeout(timer)
        resolve(granted)
      })
    })
    this.options.events.emit('permission.pending', { ...request, requestId })
    this.open('permission', { requestId })
    return promise
  }

  /** 拍摄会话由设备域创建：浮层只承接完整会话描述，不自行生成 sessionId */
  pushCaptureDialog(session: CaptureDialogSession): void {
    this.capture = session
    this.open('capture', { sessionId: session.sessionId })
  }

  closeCapture(sessionId?: string): void {
    if (!this.capture || (sessionId && this.capture.sessionId !== sessionId)) { return }
    const id = this.capture.sessionId
    this.capture = null
    this.options.onCaptureClose?.(id)
    this.dismiss('capture')
  }

  openMenu(menu: Omit<MenuView, 'id'>): void {
    this.menu = { ...menu, id: `m-${++this.seq}` }
    this.open('menu', { id: this.menu.id })
  }

  showUpdatePrompt(version: string): void {
    this.updatePrompt = version
    this.open('update-prompt', { version })
  }

  open(kind: OverlayKind, params: Readonly<Record<string, string>> = {}): void {
    const timer = this.clearTimers.get(kind)
    if (timer) {
      clearTimeout(timer)
      this.clearTimers.delete(kind)
    }
    if (kind === 'config') { this.config = params.kind ?? 'devices' }
    if (kind === 'app-center') { this.appCenterOpen = true }
    this.options.windows.openOverlay(kind, params)
    this.push(kind)
  }

  dismiss(kind: OverlayKind): void {
    if (kind === 'permission') { this.permission = null }
    if (kind === 'menu') { this.menu = null }
    if (kind === 'capture') { this.capture = null }
    if (kind === 'config') { this.config = null }
    if (kind === 'app-center') { this.appCenterOpen = false }
    if (kind === 'update-prompt') { this.updatePrompt = null }
    // 清场先行：空帧绘制落地后再隐藏窗口
    this.push(kind)
    const existing = this.clearTimers.get(kind)
    if (existing) { clearTimeout(existing) }
    const timer = setTimeout(() => {
      this.clearTimers.delete(kind)
      this.options.windows.hideOverlay(kind)
    }, CLEAR_DELAY_MS)
    this.clearTimers.set(kind, timer)
  }

  /** 按窗口身份返回状态：跨窗调用拿不到别人的数据 */
  syncFor(senderId: number): OverlayState {
    return this.stateFor(this.options.windows.overlayKindOf(senderId) ?? 'dialog', senderId)
  }

  private stateFor(kind: OverlayKind, senderId: number): OverlayState {
    return {
      kind,
      params: this.options.windows.overlayParamsOf(senderId),
      notifications: kind === 'panel' ? this.notifications : [],
      downloads: kind === 'panel' ? this.downloads : [],
      permission: kind === 'permission' ? this.permission : null,
      menu: kind === 'menu' ? this.menu : null,
      capture: kind === 'capture' ? this.capture : null,
      config: kind === 'config' ? this.config : null,
      appCenterOpen: kind === 'app-center' && this.appCenterOpen,
      updatePrompt: kind === 'update-prompt' ? this.updatePrompt : null,
    }
  }

  private push(kind: OverlayKind): void {
    const win = this.options.windows.getOverlay(kind)
    if (win && !win.isDestroyed()) {
      this.options.windows.sendToOverlay(kind, 'overlay:updated', this.stateFor(kind, win.webContents.id))
    }
  }

  private refreshPanel(): void {
    if (!this.notifications.length && !this.downloads.length) {
      this.options.windows.hideOverlay('panel')
      return
    }
    this.push('panel')
    this.options.windows.showOverlay('panel')
  }

  private resolvePermission(requestId: string, granted: boolean): void {
    const resolve = this.pendingPermissions.get(requestId)
    if (!resolve) { return }
    this.pendingPermissions.delete(requestId)
    this.options.events.emit('permission.resolved', { requestId, granted })
    resolve(granted)
    this.dismiss('permission')
  }

  private registerIpc(): void {
    shellHandle('overlay:sync', event => this.syncFor(event.sender.id))
    shellHandle('overlay:open', (_e, kind: OverlayKind, params?: Record<string, string>) => this.open(kind, params))
    shellHandle('overlay:dismiss', (_e, kind: OverlayKind) => this.dismiss(kind))
    shellHandle('overlay:action', (event, action: OverlayAction) => {
      // 来源校验：仅目标浮层窗自身可回传动作，其它 renderer 伪造无效
      if (!this.options.windows.isOverlaySender(action.kind, event.sender.id)) {
        throw new Error('overlay action rejected: sender is not the owning window')
      }
      this.handleAction(action)
    })
    shellHandle('overlay:resize', (event, height: number) => {
      this.options.windows.resizePanel(event.sender.id, height)
    })
    shellHandle('overlay:mouseIgnore', (event, ignore: boolean) => {
      this.options.windows.setPanelMouseIgnore(event.sender.id, ignore)
    })
  }

  private handleAction(action: OverlayAction): void {
    switch (action.type) {
      case 'resolve-permission':
        if (action.requestId) { this.resolvePermission(action.requestId, action.granted === true) }
        break
      case 'select-menu':
        if (this.menu && action.action) { this.options.onMenuAction?.(action.action, this.menu) }
        this.dismiss('menu')
        break
      case 'close-capture':
        this.closeCapture(action.sessionId)
        break
      case 'dismiss':
        this.dismiss(action.kind)
        break
      default:
        this.dismiss(action.kind)
    }
  }
}
