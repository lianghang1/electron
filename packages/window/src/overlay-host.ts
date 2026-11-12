import type { OverlayKind } from '@shell/shared/ipc'
import type { BrowserWindow } from 'electron'

export type { OverlayKind } from '@shell/shared/ipc'

/**
 * 浮层种类：新增浮层 = 注册一条策略，窗口系统零分发。
 * WebContentsView 是原生合成层，永远盖在 Shell DOM 之上——所有要盖过应用区的
 * 弹窗、菜单、提示、通知必须走同一套原生窗宿主（master overlay-window.ts 注释）。
 * 联合成员定义在 @shell/shared ipc 契约（IPC 边界形状唯一真源），此处只转发。
 */

export interface OverlayPolicy<K extends string = OverlayKind> {
  readonly kind: K
  readonly width: number
  readonly height: number
  /** 渲染层路由（含自身标识的 hash query） */
  readonly route: string
  /** 同类浮层复用已存在实例（至多一个） */
  readonly singleton: boolean
  /** fullscreen = 铺满主窗内容区；anchored = 右下角消息区 */
  readonly bounds: 'fullscreen' | 'anchored'
  /** 显示时是否抢焦点；消息区不抢焦点 */
  readonly focus: boolean
  /** 透明区鼠标穿透，仅消息区需要 */
  readonly mouseIgnore: boolean
  /** 父窗：级联销毁与相对定位由窗口系统统一处理 */
  readonly parent?: () => BrowserWindow | undefined
}

/** 创建函数由窗口系统注入，注册表只管策略与实例，不自行 new BrowserWindow */
export type OverlayFactory<K extends string> = (
  policy: OverlayPolicy<K>,
  params: Readonly<Record<string, string>>,
) => BrowserWindow

/** 默认策略表：浮层差异全部是数据，不是分支 */
export const DEFAULT_OVERLAY_POLICIES: readonly OverlayPolicy<OverlayKind>[] = [
  { kind: 'panel', width: 344, height: 240, route: '#/overlay?kind=panel', singleton: true, bounds: 'anchored', focus: false, mouseIgnore: true },
  { kind: 'dialog', width: 0, height: 0, route: '#/overlay?kind=dialog', singleton: true, bounds: 'fullscreen', focus: true, mouseIgnore: false },
  { kind: 'menu', width: 0, height: 0, route: '#/overlay?kind=menu', singleton: true, bounds: 'fullscreen', focus: true, mouseIgnore: false },
  { kind: 'capture', width: 0, height: 0, route: '#/overlay?kind=capture', singleton: true, bounds: 'fullscreen', focus: true, mouseIgnore: false },
  { kind: 'permission', width: 0, height: 0, route: '#/overlay?kind=permission', singleton: true, bounds: 'fullscreen', focus: true, mouseIgnore: false },
  { kind: 'config', width: 0, height: 0, route: '#/overlay?kind=config', singleton: true, bounds: 'fullscreen', focus: true, mouseIgnore: false },
  { kind: 'app-center', width: 0, height: 0, route: '#/overlay?kind=app-center', singleton: true, bounds: 'fullscreen', focus: true, mouseIgnore: false },
  { kind: 'settings', width: 0, height: 0, route: '#/overlay?kind=settings', singleton: true, bounds: 'fullscreen', focus: true, mouseIgnore: false },
  { kind: 'command-palette', width: 0, height: 0, route: '#/overlay?kind=command-palette', singleton: true, bounds: 'fullscreen', focus: true, mouseIgnore: false },
  { kind: 'update-prompt', width: 0, height: 0, route: '#/overlay?kind=update-prompt', singleton: true, bounds: 'fullscreen', focus: true, mouseIgnore: false },
]

/**
 * 通用浮层宿主：按种类登记策略，按种类开窗/取窗/收场。
 * 业务服务（通知、授权、拍摄会话）只依赖取到的窗口句柄，不认识窗口创建细节。
 */
export class OverlayHost<K extends string = OverlayKind> {
  private readonly policies = new Map<K, OverlayPolicy<K>>()
  /** 按种类记录的当前实例：单例复用、get/dismiss 的对象 */
  private readonly instances = new Map<K, BrowserWindow>()
  /** 全部已创建且未销毁的窗口：非单例策略下也不能漏关 */
  private readonly created = new Map<BrowserWindow, K>()
  /** 每个窗口的 URL 参数：sync 时按身份回传 */
  private readonly params = new Map<BrowserWindow, Readonly<Record<string, string>>>()

  constructor(private readonly factory: OverlayFactory<K>) {}

  register(policy: OverlayPolicy<K>): void {
    if (this.policies.has(policy.kind)) {
      throw new Error(`overlay policy already registered: ${policy.kind}`)
    }
    this.policies.set(policy.kind, policy)
  }

  policy(kind: K): OverlayPolicy<K> {
    const policy = this.policies.get(kind)
    if (!policy) { throw new Error(`overlay policy not registered: ${kind}`) }
    return policy
  }

  open(kind: K, params: Readonly<Record<string, string>> = {}): BrowserWindow {
    const policy = this.policy(kind)
    const existing = this.instances.get(kind)
    if (policy.singleton && existing && !existing.isDestroyed()) {
      this.params.set(existing, params)
      existing.focus()
      return existing
    }
    const win = this.factory(policy, params)
    this.created.set(win, kind)
    this.params.set(win, params)
    this.instances.set(kind, win)
    win.once('closed', () => {
      this.created.delete(win)
      this.params.delete(win)
      if (this.instances.get(kind) === win) { this.instances.delete(kind) }
    })
    return win
  }

  get(kind: K): BrowserWindow | undefined {
    const win = this.instances.get(kind)
    return win && !win.isDestroyed() ? win : undefined
  }

  ownerOf(senderId: number): K | undefined {
    for (const [win, kind] of this.created) {
      if (!win.isDestroyed() && win.webContents.id === senderId) { return kind }
    }
    return undefined
  }

  paramsOf(senderId: number): Readonly<Record<string, string>> {
    for (const [win, params] of this.params) {
      if (!win.isDestroyed() && win.webContents.id === senderId) { return params }
    }
    return {}
  }

  dismiss(kind: K): void {
    for (const [win, owner] of [...this.created]) {
      if (owner === kind && !win.isDestroyed()) { win.close() }
    }
    this.instances.delete(kind)
  }

  hide(kind: K): void {
    const win = this.get(kind)
    if (win && win.isVisible()) { win.hide() }
  }

  closeAll(): void {
    for (const win of [...this.created.keys()]) {
      if (!win.isDestroyed()) { win.close() }
    }
    this.instances.clear()
    this.created.clear()
    this.params.clear()
  }
}
