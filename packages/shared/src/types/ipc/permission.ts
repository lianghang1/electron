/**
 * 权限域契约：仅用于 UI 展示，授权以 Main 为准。
 */
import type { AppPermissionState, Permission, PermissionRequest } from '../permission'

export type PermissionIpc = {
  'permission:check': (permission: Permission) => boolean
  /** 用户对运行时权限请求的决策回传（仅 Shell 可调用） */
  'permission:respond': (requestId: string, granted: boolean) => void
  /** App 权限状态列表（声明 + 运行时决策合成视图，决策已平台级持久化） */
  'permission:list': (appId: string) => AppPermissionState[]
  /** 撤销 App 的全部运行时授权决策（仅 Shell 可调用），下次请求重新询问 */
  'permission:reset': (appId: string) => void

  // ---- Main → Renderer 推送 ----
  /** App 请求未声明权限，请用户决策（允许 / 拒绝，会话内记忆） */
  'permission:request': [PermissionRequest]
  /** 全量挂起中的运行时授权请求（Main → OverlayWindow 权限弹窗渲染数据源） */
  'permission:pending': [PermissionRequest[]]
}
