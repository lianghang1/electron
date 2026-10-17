import type { AppPermissionState, Permission, PermissionRequest } from '../permission'
import { defineDomain, invoke, push } from '../../domain'

/**
 * permission 域契约：App 权限状态查询（Shell 管理面 + 业务页自检），仅用于 UI 展示，授权以 Main 为准。
 * 运行时授权弹窗的决策回传与挂起推送见 permissionDialog 域（弹窗窗专属）。
 */
export const permissionDomain = defineDomain('permission', {
  check: invoke<(permission: Permission) => boolean>(),
  /** App 权限状态列表（声明 + 运行时决策合成视图，决策已平台级持久化） */
  list: invoke<(appId: string) => AppPermissionState[]>(),
  /** 撤销 App 的全部运行时授权决策（仅 Shell 可调用），下次请求重新询问 */
  reset: invoke<(appId: string) => void>(),

  // ---- Main → Renderer 推送 ----
  /** App 请求未声明权限，请用户决策（允许 / 拒绝，会话内记忆） */
  request: push<[PermissionRequest]>(),
})
