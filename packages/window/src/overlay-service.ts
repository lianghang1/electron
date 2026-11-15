import type { EventBus, NotificationCenter, PlatformNotification, Startable } from '@shell/kernel'
import type { CaptureDialogSession, DownloadTask } from '@shell/shared'
import type { OverlayAction, OverlayKind, OverlayWindowKind } from '@shell/shared/ipc'
import type { WindowSystem } from './window-system'
import { registerIpcDomain } from '@shell/bridge/handle'
import { overlayDomain } from '@shell/shared/ipc'

export interface PermissionRequestView {
  requestId: string
  appId: string
  /** 应用展示名（组合根按 catalog 解析）；未提供时回退 appId */
  appName?: string
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

/** plane 平面快照：通知/下载/权限/浮层表面全量状态（先拉后推，push 恒全量） */
export interface PlaneOverlayState {
  notifications: readonly PlatformNotification[]
  downloads: readonly DownloadTask[]
  permission: PermissionRequestView | null
  menu: MenuView | null
  appCenterOpen: boolean
  paletteOpen: boolean
  updatePrompt: string | null
  config: string | null
}

/** 按发送方身份回传的浮层状态：plane 拿平面快照，独立浮层窗拿各自的会话数据 */
export interface OverlayState {
  kind: 'plane' | OverlayWindowKind
  params: Readonly<Record<string, string>>
  plane: PlaneOverlayState | null
  capture: CaptureSessionView | null
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

/** 授权请求超时：无人值守形态不能永久挂起 */
const PERMISSION_TIMEOUT_MS = 30_000
/** 终态下载卡停留时长：到点自动消失，不靠 kernel 的账本保留期 */
const DOWNLOAD_TTL_MS = 8_000

/**
 * 统一浮层状态持有者：通知、下载卡、授权弹窗、菜单、应用中心、命令面板、更新提示、
 * 设备配置全部渲染在常驻 plane 平面（显隐/几何/焦点由 WindowSystem 单点管理，
 * 进出场为平面内 CSS 过渡）；拍摄会话与设置仍是独立浮层窗。
 * 状态由 Main 持有，plane 页 mounted 主动 sync。
 */
export class OverlayService implements Startable {
  readonly name = 'overlay'
  private readonly plane: PlaneOverlayState = {
    notifications: [],
    downloads: [],
    permission: null,
    menu: null,
    appCenterOpen: false,
    paletteOpen: false,
    updatePrompt: null,
    config: null,
  }

  /** 终态下载卡的消失时点；手动关闭的任务 id 永不再展示 */
  private readonly downloadDeadlines = new Map<string, number>()
  private readonly dismissedDownloads = new Set<string>()
  /** 授权请求队列：只渲染队首，决策完自动出队（master dialogs 语义） */
  private permissions: PermissionRequestView[] = []
  private capture: CaptureSessionView | null = null
  private readonly pendingPermissions = new Map<string, (granted: boolean) => void>()
  private readonly unsubscribers: (() => void)[] = []
  private seq = 0

  constructor(private readonly options: OverlayServiceOptions) {
    this.registerIpc()
  }

  async start(): Promise<void> {
    this.unsubscribers.push(this.options.events.on('notification.updated', ({ items }) => {
      this.plane.notifications = items
      this.syncPlane()
    }))
    this.unsubscribers.push(this.options.events.on('download.tasks-changed', ({ tasks }) => {
      const now = Date.now()
      for (const task of tasks) {
        if (task.status !== 'progressing' && !this.downloadDeadlines.has(task.id)) {
          this.downloadDeadlines.set(task.id, now + DOWNLOAD_TTL_MS)
        }
      }
      this.plane.downloads = tasks.filter((task) => {
        if (this.dismissedDownloads.has(task.id)) { return false }
        const deadline = this.downloadDeadlines.get(task.id)
        if (deadline !== undefined && task.status !== 'progressing' && now >= deadline) {
          this.dismissedDownloads.add(task.id)
          return false
        }
        return true
      })
      this.syncPlane()
    }))
    this.options.windows.prewarmOverlays()
  }

  async stop(): Promise<void> {
    for (const off of this.unsubscribers) { off() }
    this.unsubscribers.length = 0
  }

  /** PermissionPrompt.ask 实现：请求入队逐条决策，等待用户决策 / 超时（缺省拒绝） */
  requestPermission(request: Omit<PermissionRequestView, 'requestId'>): Promise<boolean> {
    const requestId = `p-${++this.seq}`
    this.permissions = [...this.permissions, { ...request, requestId }]
    const promise = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => this.resolvePermission(requestId, false), PERMISSION_TIMEOUT_MS)
      timer.unref?.()
      this.pendingPermissions.set(requestId, (granted) => {
        clearTimeout(timer)
        resolve(granted)
      })
    })
    this.options.events.emit('permission.pending', { ...request, requestId })
    this.syncPlane()
    return promise
  }

  /** 拍摄会话由设备域创建：浮层只承接完整会话描述，不自行生成 sessionId */
  pushCaptureDialog(session: CaptureDialogSession): void {
    this.capture = session
    this.options.windows.openOverlay('capture', { sessionId: session.sessionId })
    this.options.windows.sendToOverlay('capture', 'overlay:updated', this.stateFor('capture'))
  }

  closeCapture(sessionId?: string): void {
    if (!this.capture || (sessionId && this.capture.sessionId !== sessionId)) { return }
    const id = this.capture.sessionId
    this.capture = null
    this.options.onCaptureClose?.(id)
    this.options.windows.dismissOverlay('capture')
  }

  openMenu(menu: Omit<MenuView, 'id'>): void {
    this.plane.menu = { ...menu, id: `m-${++this.seq}` }
    this.syncPlane()
  }

  showUpdatePrompt(version: string): void {
    this.plane.updatePrompt = version
    this.syncPlane()
  }

  open(kind: OverlayKind, params: Readonly<Record<string, string>> = {}): void {
    if (kind === 'config') { this.plane.config = params.kind ?? 'devices' }
    else if (kind === 'app-center') { this.plane.appCenterOpen = true }
    else if (kind === 'command-palette') { this.plane.paletteOpen = true }
    else if (kind === 'capture' || kind === 'settings') {
      this.options.windows.openOverlay(kind, params)
    }
    this.syncPlane()
  }

  dismiss(kind: OverlayKind): void {
    if (kind === 'permission') { this.permissions = [] }
    else if (kind === 'menu') { this.plane.menu = null }
    else if (kind === 'config') { this.plane.config = null }
    else if (kind === 'app-center') { this.plane.appCenterOpen = false }
    else if (kind === 'command-palette') { this.plane.paletteOpen = false }
    else if (kind === 'update-prompt') { this.plane.updatePrompt = null }
    else if (kind === 'capture') { this.capture = null }
    if (kind === 'capture' || kind === 'settings') {
      this.options.windows.dismissOverlay(kind)
    }
    this.syncPlane()
  }

  /** 按窗口身份返回状态：跨窗调用拿不到别人的数据 */
  syncFor(senderId: number): OverlayState {
    if (this.options.windows.isPlaneSender(senderId)) {
      return this.planeState()
    }
    const kind = this.options.windows.overlayKindOf(senderId) ?? 'capture'
    return this.stateFor(kind, senderId)
  }

  /** plane 快照：包装与 sync 同形（先拉后推共用一个形状，组件只认一种） */
  private planeState(): OverlayState {
    return {
      kind: 'plane',
      params: {},
      plane: { ...this.plane, permission: this.permissions[0] ?? null },
      capture: null,
    }
  }

  private stateFor(kind: OverlayWindowKind, senderId?: number): OverlayState {
    return {
      kind,
      params: senderId === undefined ? {} : this.options.windows.overlayParamsOf(senderId),
      plane: null,
      capture: kind === 'capture' ? this.capture : null,
    }
  }

  /** plane 单订阅者：交互表面在列时不穿透（遮罩/卡片要收点击），toast 独占时穿透由页面按卡片悬停接管 */
  private syncPlane(): void {
    const windows = this.options.windows
    const permission = this.permissions[0] ?? null
    const interactive = Boolean(permission || this.plane.menu || this.plane.appCenterOpen
      || this.plane.paletteOpen || this.plane.updatePrompt || this.plane.config)
    const visible = interactive || this.plane.notifications.length > 0 || this.plane.downloads.length > 0
    if (!visible) {
      windows.hidePlane()
      return
    }
    windows.showPlane({ focus: interactive })
    windows.setPlaneMouseIgnore(!interactive)
    windows.sendToPlane('overlay:updated', this.planeState())
  }

  private resolvePermission(requestId: string, granted: boolean): void {
    const resolve = this.pendingPermissions.get(requestId)
    if (!resolve) { return }
    this.pendingPermissions.delete(requestId)
    this.permissions = this.permissions.filter(r => r.requestId !== requestId)
    this.options.events.emit('permission.resolved', { requestId, granted })
    resolve(granted)
    // 队列非空继续展示队首；全部清空由 syncPlane 按无内容收场
    this.syncPlane()
  }

  private registerIpc(): void {
    registerIpcDomain(overlayDomain, {
      sync: event => this.syncFor(event.sender.id),
      open: (_e, input) => this.open(input.kind, input.params),
      dismiss: (_e, kind) => this.dismiss(kind),
      action: (event, action) => {
        // 来源校验：plane 表面动作只能来自 plane 页，独立浮层窗动作只能来自所属窗口
        const windowKind = action.kind === 'capture' || action.kind === 'settings' ? action.kind : undefined
        const allowed = windowKind
          ? this.options.windows.isOverlaySender(windowKind, event.sender.id)
          : this.options.windows.isPlaneSender(event.sender.id)
        if (!allowed) {
          throw new Error('overlay action rejected: sender is not the owning surface')
        }
        this.handleAction(action)
      },
      mouseIgnore: (event, ignore) => {
        if (this.options.windows.isPlaneSender(event.sender.id)) {
          this.options.windows.setPlaneMouseIgnore(ignore)
        }
      },
    })
  }

  private handleAction(action: OverlayAction): void {
    switch (action.type) {
      case 'resolve-permission':
        if (action.requestId) { this.resolvePermission(action.requestId, action.granted === true) }
        break
      case 'select-menu':
        if (this.plane.menu && action.action) { this.options.onMenuAction?.(action.action, this.plane.menu) }
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
