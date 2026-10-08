import type { AppPermissionState, Permission, PermissionRequest } from '../permission'
import { defineDomain, invoke, push } from '../../domain'

/**
 * 权限域契约：仅用于 UI 展示，授权以 Main 为准。
 */
export const permissionDomain = defineDomain('permission', {
  check: invoke<(permission: Permission) => boolean>(),
  /** 用户对运行时权限请求的决策回传（仅 Shell 可调用） */
  respond: invoke<(requestId: string, granted: boolean) => void>(),
  /** App 权限状态列表（声明 + 运行时决策合成视图，决策已平台级持久化） */
  list: invoke<(appId: string) => AppPermissionState[]>(),
  /** 撤销 App 的全部运行时授权决策（仅 Shell 可调用），下次请求重新询问 */
  reset: invoke<(appId: string) => void>(),

  // ---- Main → Renderer 推送 ----
  /** App 请求未声明权限，请用户决策（允许 / 拒绝，会话内记忆） */
  request: push<[PermissionRequest]>(),
  /** 全量挂起中的运行时授权请求（Main → OverlayWindow 权限弹窗渲染数据源） */
  pending: push<[PermissionRequest[]]>(),
})
