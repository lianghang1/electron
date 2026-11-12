import type { IpcDefs, IpcDomainValue } from '../contract'
import { defineIpcDomain, invoke, push } from '../contract'

/**
 * 浮层种类：原生浮层宿主按策略注册表开窗，渲染层按 kind 寻址。
 * （窗口系统 packages/window overlay-host 复用此定义，IPC 边界形状唯一真源。）
 */
export type OverlayKind
  = | 'panel' | 'dialog' | 'menu' | 'capture' | 'permission' | 'config'
    | 'app-center' | 'settings' | 'command-palette' | 'update-prompt'

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

/**
 * 原生浮层宿主域契约：所有要盖过应用 view 的 UI 统一从这里开窗。
 * push `updated` 推全量浮层状态快照（channel `overlay:updated`，注册实现在
 * packages/window OverlayService——字面量与本契约派生名同形，零迁移）。
 */
export const overlayDomain = defineIpcDomain('overlay', {
  sync: invoke<() => any>(),
  open: invoke<(kind: OverlayKind, params?: Record<string, string>) => void>(),
  dismiss: invoke<(kind: OverlayKind) => void>(),
  action: invoke<(action: OverlayAction) => void>(),
  /** 浮层页上报内容高度，宿主据此调整窗口尺寸 */
  resize: invoke<(height: number) => void>(),
  /** 浮层穿透态切换：鼠标事件穿透 / 恢复拦截 */
  mouseIgnore: invoke<(ignore: boolean) => void>(),
  updated: push<[state: unknown]>(),
}) satisfies IpcDomainValue<'overlay', IpcDefs>
