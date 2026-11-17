import type { IpcDefs, IpcDomainValue } from '../contract'
import { defineIpcDomain, invoke, push } from '../contract'

/**
 * 浮层架构（单 plane + 表面模型）：全部浮层 UI（toast/通知/权限/菜单/应用中心/
 * 设置/拍摄）渲染在常驻全屏透明子窗（plane）内。主进程 OverlayCenter
 * 持有表面实例状态并单点广播快照；渲染层 registry/engine 按 mode 自动配对容器
 * 行为（穿透/焦点/遮罩/过期），业务组件只见内容 payload。
 *
 * mode 语义（套 Web UI 框架组件名）：
 * - toast      角标堆叠瞬态卡（通知/下载），plane 穿透、悬停拦截，TTL 自动离场
 * - notification 持久通知条（带动作按钮），容器行为与 toast 同族，可独立演化
 * - dialog     焦点型模态面板（权限/菜单/应用中心/设置/拍摄），遮罩 + 外点关闭
 */

/** 表面模式：容器行为由渲染层 engine 按 mode 自动配对 */
export type OverlaySurfaceMode = 'toast' | 'notification' | 'dialog'

/** 表面运行时状态（Center 实例账本的快照投影） */
export interface OverlaySurfaceState {
  /** 实例 id：单例表面与 surface 同名，带 tag 的瞬态实例形如 `${surface}#${tag}` */
  id: string
  /** registry 中的表面标识 */
  surface: string
  mode: OverlaySurfaceMode
  /** 业务载荷（形状由表面定义，渲染层 mapProps 适配组件 props） */
  payload: unknown
  /**
   * 生命周期：presented → dismissed（离场动画窗口，渲染层立即播 leave 过渡）
   * → 实例移除（removeDelay 到点，快照中消失）
   */
  phase: 'presented' | 'dismissed'
}

/** 全量快照：单一状态流（push state），渲染层先拉后推共用一个形状 */
export interface OverlaySnapshot {
  surfaces: OverlaySurfaceState[]
  /** hover 冻结：toast 系计时暂停（react-hot-toast pausedAt 语义） */
  paused: boolean
}

/** 打开表面：surface 必须在 Center 目录中；payload 形状由表面定义 */
export interface OverlayPresentInput {
  surface: string
  payload?: unknown
  /** tag 去重：同 tag 实例替换载荷而非新建 */
  tag?: string
  /** 到期自动离场（toast 系）；不传则常驻直到显式 dismiss */
  ttlMs?: number
}

/** 关闭表面：缺省 id 关闭该表面全部实例 */
export interface OverlayDismissInput {
  surface: string
  id?: string
}

/** 表面动作回传（按钮点击/权限结论/菜单选择等），处理按 surface 路由 */
export interface OverlaySurfaceAction {
  surface: string
  /** 动作所属实例 id */
  id: string
  type: string
  data?: Record<string, unknown>
}

/**
 * 原生浮层宿主域契约：所有要盖过应用 view 的 UI 统一走 plane 表面。
 * push `state` 推全量表面快照（channel `overlay:state`，注册实现在
 * packages/window overlay/center.ts）。mouseIgnore 是窗口基建通道（toast
 * 悬停穿透切换），业务表面不直接消费。
 */
export const overlayDomain = defineIpcDomain('overlay', {
  sync: invoke<() => OverlaySnapshot>(),
  present: invoke<(input: OverlayPresentInput) => void>(),
  dismiss: invoke<(input: OverlayDismissInput) => void>(),
  action: invoke<(action: OverlaySurfaceAction) => void>(),
  /** toast 系悬停冻结：渲染层上报，Center 暂停/恢复实例 TTL 计时 */
  pause: invoke<(paused: boolean) => void>(),
  /** plane 穿透态切换：toast 独占时鼠标穿透，悬停进卡片临时拦截 */
  mouseIgnore: invoke<(ignore: boolean) => void>(),
  state: push<[snapshot: OverlaySnapshot]>(),
}) satisfies IpcDomainValue<'overlay', IpcDefs>
