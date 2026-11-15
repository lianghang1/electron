import type { OverlayWindowKind } from '@shell/shared/ipc'
import type { BrowserWindow } from 'electron'

export type { OverlayKind, OverlaySurfaceKind, OverlayWindowKind } from '@shell/shared/ipc'

/**
 * 浮层种类：独立浮层窗只有 capture/settings；其余表面（通知/下载/权限/菜单/应用中心/
 * 命令面板/更新/配置）由常驻 plane 平面渲染，不走窗口策略。
 * 盖过应用区的两种性质：独立浮层窗与 plane 是有父窗口（OS 级子窗恒在父窗内容之上）；
 * 应用视图是 WebContentsView，原生合成层永远盖在 Shell DOM 之上（master overlay-window.ts 注释）。
 * 联合成员定义在 @shell/shared ipc 契约（IPC 边界形状唯一真源），此处只转发。
 */

export interface OverlayPolicy<K extends string = OverlayWindowKind> {
  readonly kind: K
  /**
   * 窗口内容尺寸 = 页面卡片的完整落位（卡片 + 四周透明边距，页面在边距里画投影；
   * 透明窗会硬裁超位内容，master overlay-window SHADOW 注释）。创建时按父窗内容区
   * 居中落位一次，此后窗口可被用户拖走（movable），不再跟随父窗重铺。
   */
  readonly width: number
  readonly height: number
  /** OS 级拖动开关：卡片窗为 true，拖动把手由页面 header 的 app-region 声明 */
  readonly movable: boolean
  /** 渲染层路由（含自身标识的 hash query） */
  readonly route: string
  /** 同类浮层复用已存在实例（至多一个） */
  readonly singleton: boolean
  /** 父窗：级联销毁与 z 序（OS 级子窗恒在父窗之上）由窗口系统统一处理 */
  readonly parent?: () => BrowserWindow | undefined
}

/** 创建函数由窗口系统注入，注册表只管策略与实例，不自行 new BrowserWindow */
export type OverlayFactory<K extends string> = (
  policy: OverlayPolicy<K>,
  params: Readonly<Record<string, string>>,
) => BrowserWindow

/**
 * 独立浮层窗策略表：capture/settings 是可拖动卡片窗（拖动把手在页面 header），
 * 其余表面归 plane 平面。尺寸 = 卡片完整落位（卡片 760×580 / 560×600 + 32px 投影边距）。
 */
export const DEFAULT_OVERLAY_POLICIES: readonly OverlayPolicy<OverlayWindowKind>[] = [
  { kind: 'capture', width: 824, height: 644, movable: true, route: '#/overlay?kind=capture', singleton: true },
  { kind: 'settings', width: 624, height: 664, movable: true, route: '#/overlay?kind=settings', singleton: true },
]

/**
 * 通用浮层宿主：按种类登记策略，按种类开窗/取窗/收场。
 * 业务服务（通知、授权、拍摄会话）只依赖取到的窗口句柄，不认识窗口创建细节。
 */
export class OverlayHost<K extends string = OverlayWindowKind> {
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
