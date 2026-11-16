import type { EventBus, NotificationCenter, PlatformNotification, Startable } from '@shell/kernel'
import type { CaptureDialogSession, DownloadTask } from '@shell/shared'
import type { OverlayDismissInput, OverlayPresentInput, OverlaySnapshot, OverlaySurfaceAction, OverlaySurfaceMode, OverlaySurfaceState } from '@shell/shared/ipc'
import type { WindowSystem } from '../window-system'
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

/**
 * 表面实例句柄（electron-uikit 签名）：present 返回，调用方按结果流转。
 * success = 正常收场确认；fail = 内容异常收场（实例立即离场）；dismiss = 主动关闭。
 */
export interface SurfaceHandle {
  success: () => void
  fail: (err: Error) => void
  dismiss: () => void
}

/**
 * 表面 → 模式目录：容器行为由渲染层 engine 按 mode 自动配对；主进程只认
 * mode 做焦点/穿透决策。表面清单即产品浮层全集，新增表面在此登记。
 */
const SURFACE_MODES: Record<string, OverlaySurfaceMode> = {
  'toast-stack': 'toast',
  'permission': 'dialog',
  'tab-menu': 'dialog',
  'app-center': 'dialog',
  'command-palette': 'command',
  'update-prompt': 'dialog',
  'config': 'dialog',
  'settings': 'dialog',
  'capture': 'dialog',
}

export interface OverlayCenterOptions {
  windows: WindowSystem
  events: EventBus
  notifications: NotificationCenter
  /** 菜单动作回传给应用运行时；未注入时只关闭菜单 */
  onMenuAction?: (action: string, menu: MenuView) => void
  /** 拍摄会话关闭回传给设备域（取消/收场统一出口） */
  onCaptureClose?: (sessionId: string) => void
}

/** 授权请求超时：无人值守形态不能永久挂起 */
const PERMISSION_TIMEOUT_MS = 30_000
/** 终态下载卡停留时长：到点自动消失，不靠 kernel 的账本保留期 */
const DOWNLOAD_TTL_MS = 8_000
/** dismissed → 移除的离场动画窗口：渲染层在 phase 翻转时立即播 leave 过渡 */
const REMOVE_DELAY_MS = 200

/**
 * 浮层中枢（OverlayCenter）：单 plane 常驻透明子窗承载全部浮层表面。
 * 职责单一——持有表面实例账本（present/dismiss/TTL/tag 去重/pause 冻结），
 * 按实例 mode 单点决策 plane 焦点与穿透，向 plane 广播全量快照（单一
 * overlay:state 流，先拉后推同形）。窗口基建归 WindowSystem，容器行为归
 * 渲染层 engine，业务组件只见 payload。
 */
export class OverlayCenter implements Startable {
  readonly name = 'overlay'

  /** 实例账本：instanceId → 运行时状态（单例表面 id = surface，tag 实例 = surface#tag） */
  private readonly surfaces = new Map<string, OverlaySurfaceState>()
  /** 实例 TTL 计时（present 传入 ttlMs 的表面）：剩余时长冻结用 */
  private readonly ttlTimers = new Map<string, { timer: NodeJS.Timeout, remainingMs: number, startedAt: number }>()
  /** dismissed → 移除的宽限计时：离场动画播完才从账本抹掉 */
  private readonly removeTimers = new Map<string, NodeJS.Timeout>()

  private paused = false
  private pausedAt: number | null = null
  /** 终态下载卡的消失时点（绝对时间轴，pause 时整体平移冻结） */
  private readonly downloadDeadlines = new Map<string, number>()
  private readonly dismissedDownloads = new Set<string>()

  /** kernel 通知账本镜像 + 下载任务镜像：合成 toast-stack 表面载荷 */
  private notifications: readonly PlatformNotification[] = []
  private downloads: readonly DownloadTask[] = []

  /** 授权请求队列：只渲染队首，决策完自动出队（master dialogs 语义） */
  private permissions: PermissionRequestView[] = []
  private readonly pendingPermissions = new Map<string, (granted: boolean) => void>()
  private readonly unsubscribers: (() => void)[] = []
  private seq = 0

  constructor(private readonly options: OverlayCenterOptions) {
    this.registerIpc()
  }

  async start(): Promise<void> {
    this.unsubscribers.push(this.options.events.on('notification.updated', ({ items }) => {
      this.notifications = items
      this.syncToastStack()
    }))
    this.unsubscribers.push(this.options.events.on('download.tasks-changed', ({ tasks }) => {
      const now = Date.now()
      for (const task of tasks) {
        if (task.status !== 'progressing' && !this.downloadDeadlines.has(task.id)) {
          this.downloadDeadlines.set(task.id, now + DOWNLOAD_TTL_MS)
        }
      }
      this.downloads = tasks.filter((task) => {
        if (this.dismissedDownloads.has(task.id)) { return false }
        const deadline = this.downloadDeadlines.get(task.id)
        if (deadline !== undefined && task.status !== 'progressing' && now >= deadline) {
          this.dismissedDownloads.add(task.id)
          return false
        }
        return true
      })
      this.syncToastStack()
    }))
  }

  async stop(): Promise<void> {
    for (const off of this.unsubscribers) { off() }
    this.unsubscribers.length = 0
    for (const { timer } of this.ttlTimers.values()) { clearTimeout(timer) }
    this.ttlTimers.clear()
    for (const timer of this.removeTimers.values()) { clearTimeout(timer) }
    this.removeTimers.clear()
    this.surfaces.clear()
  }

  // ── 主进程业务入口（组合根 / 设备域调用）────────────────────────

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
    this.presentPermissionHead()
    return promise
  }

  /** 拍摄会话由设备域创建：浮层只承接完整会话描述，不自行生成 sessionId */
  pushCaptureDialog(session: CaptureDialogSession): SurfaceHandle {
    return this.present({ surface: 'capture', payload: session })
  }

  closeCapture(sessionId?: string): void {
    const current = this.surfaces.get('capture')
    if (!current || current.phase !== 'presented') { return }
    if (sessionId) {
      const payload = current.payload as CaptureDialogSession
      if (payload?.sessionId !== sessionId) { return }
    }
    const id = (current.payload as CaptureDialogSession).sessionId
    this.dismissInternal('capture')
    this.options.onCaptureClose?.(id)
  }

  openMenu(menu: Omit<MenuView, 'id'>): void {
    this.present({ surface: 'tab-menu', payload: { ...menu, id: `m-${++this.seq}` } })
  }

  showUpdatePrompt(version: string): void {
    this.present({ surface: 'update-prompt', payload: { version } })
  }

  // ── 表面模型 API ────────────────────────────────────────────────

  /**
   * 打开表面：单例表面（id = surface）重复 present 即替换载荷；带 tag 的
   * 瞬态实例同 tag 去重替换。返回流转句柄供调用方收场。
   */
  present(input: OverlayPresentInput): SurfaceHandle {
    const mode = SURFACE_MODES[input.surface]
    if (!mode) { throw new Error(`overlay surface not registered: ${input.surface}`) }
    const id = input.tag ? `${input.surface}#${input.tag}` : input.surface
    const existing = this.surfaces.get(id)
    if (existing) {
      const removeTimer = this.removeTimers.get(id)
      if (removeTimer) {
        clearTimeout(removeTimer)
        this.removeTimers.delete(id)
      }
      const ttl = this.ttlTimers.get(id)
      if (ttl) {
        clearTimeout(ttl.timer)
        this.ttlTimers.delete(id)
      }
    }
    this.surfaces.set(id, { id, surface: input.surface, mode, payload: input.payload ?? {}, phase: 'presented' })
    if (input.ttlMs !== undefined) { this.armTtl(id, input.ttlMs) }
    this.pushState()
    return {
      success: () => this.dismissInternal(input.surface, id),
      fail: () => this.dismissInternal(input.surface, id),
      dismiss: () => this.dismissInternal(input.surface, id),
    }
  }

  /** 关闭表面：缺省 id 关闭该表面全部实例（含 dismissed 残留清理） */
  dismiss(input: OverlayDismissInput): void {
    for (const id of [...this.surfaces.keys()]) {
      if (id === input.surface || id.startsWith(`${input.surface}#`)) {
        this.dismissInternal(input.surface, id)
      }
    }
  }

  /** hover 冻结：toast 系实例 TTL 与下载卡截止时间一并暂停/恢复 */
  setPaused(paused: boolean): void {
    if (this.paused === paused) { return }
    this.paused = paused
    if (paused) {
      this.pausedAt = Date.now()
      for (const entry of this.ttlTimers.values()) {
        clearTimeout(entry.timer)
        entry.remainingMs = Math.max(0, entry.startedAt + entry.remainingMs - Date.now())
      }
    }
    else {
      const shift = this.pausedAt !== null ? Date.now() - this.pausedAt : 0
      this.pausedAt = null
      for (const [taskId, deadline] of this.downloadDeadlines) {
        this.downloadDeadlines.set(taskId, deadline + shift)
      }
      for (const [id, entry] of [...this.ttlTimers]) {
        entry.startedAt = Date.now()
        entry.timer = setTimeout(() => this.expireTtl(id), entry.remainingMs)
        entry.timer.unref?.()
      }
    }
    this.pushState()
  }

  /** 拍摄表面的宿主身份：设备域预览帧通道与动作校验都锚在 plane 页 */
  captureSurfaceWindow(): { webContents: Electron.WebContents } | null {
    return this.options.windows.planeSurface()
  }

  // ── 内部机制 ────────────────────────────────────────────────────

  private armTtl(id: string, ttlMs: number): void {
    const entry = { timer: setTimeout(() => this.expireTtl(id), ttlMs), remainingMs: ttlMs, startedAt: Date.now() }
    entry.timer.unref?.()
    this.ttlTimers.set(id, entry)
  }

  private expireTtl(id: string): void {
    this.ttlTimers.delete(id)
    const surface = id.split('#')[0]
    this.dismissInternal(surface, id)
  }

  /** 实例离场：phase → dismissed（渲染层立即播 leave），宽限到点从账本移除 */
  private dismissInternal(surface: string, id?: string): void {
    for (const [key, state] of [...this.surfaces]) {
      const hit = id ? key === id : (key === surface || key.startsWith(`${surface}#`))
      if (!hit || state.phase !== 'presented') { continue }
      const ttl = this.ttlTimers.get(key)
      if (ttl) {
        clearTimeout(ttl.timer)
        this.ttlTimers.delete(key)
      }
      state.phase = 'dismissed'
      const timer = setTimeout(() => {
        this.removeTimers.delete(key)
        this.surfaces.delete(key)
        this.pushState()
      }, REMOVE_DELAY_MS)
      timer.unref?.()
      this.removeTimers.set(key, timer)
      if (key === 'toast-stack') {
        this.downloadDeadlines.clear()
      }
    }
    this.pushState()
  }

  /** 通知/下载镜像 → toast-stack 表面（有内容即在列，空则离场） */
  private syncToastStack(): void {
    const hasContent = this.notifications.length > 0 || this.downloads.length > 0
    if (hasContent) {
      this.present({ surface: 'toast-stack', payload: { notifications: this.notifications, downloads: this.downloads } })
    }
    else {
      this.dismissInternal('toast-stack')
    }
  }

  private presentPermissionHead(): void {
    const head = this.permissions[0] ?? null
    if (head) { this.present({ surface: 'permission', payload: head }) }
    else { this.dismissInternal('permission') }
  }

  private resolvePermission(requestId: string, granted: boolean): void {
    const resolve = this.pendingPermissions.get(requestId)
    if (!resolve) { return }
    this.pendingPermissions.delete(requestId)
    this.permissions = this.permissions.filter(r => r.requestId !== requestId)
    this.options.events.emit('permission.resolved', { requestId, granted })
    resolve(granted)
    // 队列非空继续展示队首；全部清空由 presentPermissionHead 按无内容收场
    this.presentPermissionHead()
  }

  /** 单点广播：mode 决策焦点/穿透 + 全量快照推送（单一状态流） */
  private pushState(): void {
    const windows = this.options.windows
    const presented = [...this.surfaces.values()].filter(s => s.phase === 'presented')
    const interactive = presented.some(s => s.mode === 'dialog' || s.mode === 'command')
    if (interactive) { windows.focusPlane() }
    else { windows.blurPlane() }
    windows.setPlaneMouseIgnore(!interactive)
    windows.sendToPlane('overlay:state', this.snapshot())
  }

  private snapshot(): OverlaySnapshot {
    return {
      surfaces: [...this.surfaces.values()],
      paused: this.paused,
    }
  }

  private registerIpc(): void {
    registerIpcDomain(overlayDomain, {
      // 快照只服务 plane 页（唯一状态消费者）；跨窗调用拿不到别人表面
      sync: (event) => {
        if (!this.options.windows.isPlaneSender(event.sender.id)) {
          throw new Error('overlay sync rejected: sender is not the overlay plane')
        }
        return this.snapshot()
      },
      present: (_e, input) => {
        this.present(input)
      },
      dismiss: (_e, input) => this.dismiss(input),
      action: (event, action) => {
        // 表面动作只能来自 plane 页（全部浮层 UI 在 plane 内渲染）
        if (!this.options.windows.isPlaneSender(event.sender.id)) {
          throw new Error('overlay action rejected: sender is not the overlay plane')
        }
        this.handleAction(action)
      },
      pause: (event, paused) => {
        if (this.options.windows.isPlaneSender(event.sender.id)) {
          this.setPaused(paused)
        }
      },
      mouseIgnore: (event, ignore) => {
        if (this.options.windows.isPlaneSender(event.sender.id)) {
          this.options.windows.setPlaneMouseIgnore(ignore)
        }
      },
    })
  }

  private handleAction(action: OverlaySurfaceAction): void {
    const data = action.data ?? {}
    switch (action.surface) {
      case 'permission':
        if (action.type === 'resolve') { this.resolvePermission(String(data.requestId ?? ''), data.granted === true) }
        break
      case 'tab-menu':
        if (action.type === 'select') {
          const menu = this.surfaces.get(action.id)?.payload as MenuView | undefined
          if (menu && typeof data.action === 'string') { this.options.onMenuAction?.(data.action, menu) }
        }
        this.dismiss({ surface: 'tab-menu' })
        break
      case 'capture':
        if (action.type === 'close') { this.closeCapture(typeof data.sessionId === 'string' ? data.sessionId : undefined) }
        break
      default:
        this.dismiss({ surface: action.surface })
    }
  }
}
