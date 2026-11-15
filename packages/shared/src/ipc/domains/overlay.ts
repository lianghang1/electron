import type { IpcDefs, IpcDomainValue } from '../contract'
import { defineIpcDomain, invoke, push } from '../contract'

/**
 * 浮层载体只有两种：capture/settings 是独立浮层窗（可拖动卡片窗，窗口系统
 * overlay-host 策略表）；其余是 plane 平面（常驻全屏透明子窗，master overlay-window
 * 单窗承载全部浮层）内的表面，主进程按状态渲染，渲染层按 kind 寻址动作与关闭。
 * （packages/window overlay-host 复用此定义，IPC 边界形状唯一真源。）
 */
export type OverlayWindowKind = 'capture' | 'settings'
export type OverlaySurfaceKind
  = | 'menu' | 'permission' | 'app-center' | 'command-palette'
    | 'update-prompt' | 'config'
export type OverlayKind = OverlayWindowKind | OverlaySurfaceKind

/** 浮层页回传给宿主的动作（按钮点击 / 菜单选择 / 权限结论 / 关闭拍摄会话等） */
export interface OverlayAction {
  kind: OverlayKind
  type: 'resolve-permission' | 'select-menu' | 'close-capture' | 'dismiss' | 'open-app' | 'reload' | 'close-tab'
  requestId?: string
  granted?: boolean
  action?: string
  appId?: string
  /** 动作目标实例（close-tab / reload 语义用） */
  tabId?: string
  /** 动作目标拍摄会话（close-capture 语义用） */
  sessionId?: string
}

/** 浮层开窗请求（多参数收对象） */
export interface OverlayOpenInput {
  kind: OverlayKind
  params?: Record<string, string>
}

/**
 * 原生浮层宿主域契约：所有要盖过应用 view 的 UI 统一从这里开窗。
 * push `updated` 推全量浮层状态快照（channel `overlay:updated`，注册实现在
 * packages/window OverlayService——字面量与本契约派生名同形，零迁移）。
 */
export const overlayDomain = defineIpcDomain('overlay', {
  sync: invoke<() => any>(),
  open: invoke<(input: OverlayOpenInput) => void>(),
  dismiss: invoke<(kind: OverlayKind) => void>(),
  action: invoke<(action: OverlayAction) => void>(),
  /** plane 穿透态切换：toast 独占时鼠标穿透，鼠标进卡片临时拦截（WebContentsView 无逐像素命中） */
  mouseIgnore: invoke<(ignore: boolean) => void>(),
  updated: push<[state: unknown]>(),
}) satisfies IpcDomainValue<'overlay', IpcDefs>
