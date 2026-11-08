import type { BrowserWindow } from 'electron'

/** 浮层种类：新增浮层 = 注册一条策略，窗口系统零分发 */
export type OverlayKind = 'capture' | 'permission' | 'app-center' | 'settings'

export interface OverlayPolicy<K extends string = OverlayKind> {
  readonly kind: K
  readonly width: number
  readonly height: number
  /** 渲染层路由（含自身标识的 hash query） */
  readonly route: string
  /** 同类浮层复用已存在实例（至多一个） */
  readonly singleton: boolean
  /** 父窗：级联销毁与相对定位由窗口系统统一处理 */
  readonly parent?: () => BrowserWindow | undefined
}

/** 创建函数由窗口系统注入，注册表只管策略与实例，不自行 new BrowserWindow */
export type OverlayFactory<K extends string> = (
  policy: OverlayPolicy<K>,
  params: Readonly<Record<string, string>>,
) => BrowserWindow

/** 默认策略表：四类浮层的差异全部是数据，不是分支 */
export const DEFAULT_OVERLAY_POLICIES: readonly OverlayPolicy<OverlayKind>[] = [
  { kind: 'capture', width: 480, height: 360, route: '#/overlay?kind=capture', singleton: true },
  { kind: 'permission', width: 480, height: 360, route: '#/overlay?kind=permission', singleton: true },
  { kind: 'app-center', width: 640, height: 520, route: '#/overlay?kind=app-center', singleton: true },
  { kind: 'settings', width: 640, height: 520, route: '#/overlay?kind=settings', singleton: true },
]

/**
 * 通用浮层宿主：按种类登记策略，按种类开窗/取窗/收场。
 * 业务服务（拍摄会话、授权弹窗）只依赖取到的窗口句柄，不认识窗口创建细节。
 */
export class OverlayHost<K extends string = OverlayKind> {
  private readonly policies = new Map<K, OverlayPolicy<K>>()
  /** 按种类记录的当前实例：单例复用、get/dismiss 的对象 */
  private readonly instances = new Map<K, BrowserWindow>()
  /** 全部已创建且未销毁的窗口：非单例策略下也不能漏关 */
  private readonly created = new Map<BrowserWindow, K>()

  constructor(private readonly factory: OverlayFactory<K>) {}

  register(policy: OverlayPolicy<K>): void {
    if (this.policies.has(policy.kind)) {
      throw new Error(`overlay policy already registered: ${policy.kind}`)
    }
    this.policies.set(policy.kind, policy)
  }

  open(kind: K, params: Readonly<Record<string, string>> = {}): BrowserWindow {
    const policy = this.requirePolicy(kind)
    const existing = this.instances.get(kind)
    if (policy.singleton && existing && !existing.isDestroyed()) {
      existing.focus()
      return existing
    }
    const win = this.factory(policy, params)
    this.created.set(win, kind)
    this.instances.set(kind, win)
    win.once('closed', () => {
      this.created.delete(win)
      if (this.instances.get(kind) === win) { this.instances.delete(kind) }
    })
    return win
  }

  get(kind: K): BrowserWindow | undefined {
    const win = this.instances.get(kind)
    return win && !win.isDestroyed() ? win : undefined
  }

  dismiss(kind: K): void {
    for (const [win, owner] of [...this.created]) {
      if (owner === kind && !win.isDestroyed()) { win.close() }
    }
    this.instances.delete(kind)
  }

  closeAll(): void {
    for (const win of [...this.created.keys()]) {
      if (!win.isDestroyed()) { win.close() }
    }
    this.instances.clear()
    this.created.clear()
  }

  private requirePolicy(kind: K): OverlayPolicy<K> {
    const policy = this.policies.get(kind)
    if (!policy) { throw new Error(`overlay policy not registered: ${kind}`) }
    return policy
  }
}
