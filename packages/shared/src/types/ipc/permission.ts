import type { AppPermissionState, Permission, PermissionRequest } from '../permission'
import { defineDomain, invoke, push } from '../../domain'

/**
 * permission 域契约：App 权限状态查询（Shell 管理面 + 业务页自检），仅用于 UI 展示，授权以 Main 为准。
 * respond 是运行时授权弹窗（浮层窗）的决策回传，isOverlay 关卡校验弹窗窗身份。
 * 文件与 core/src/ipc/permission.ts（注册实现）一一对应。
 */
export const permissionDomain = defineDomain('permission', {
  check: invoke<(permission: Permission) => boolean>(),
  /**
   * 用户对运行时权限请求的决策回传（仅授权弹窗浮层窗可调，isOverlay 校验）。
   * Main 落库并刷新挂起列表推送（pendingUpdated）。
   */
  respond: invoke<(input: { requestId: string, granted: boolean }) => void>(),
  /** App 权限状态列表（声明 + 运行时决策合成视图，决策已平台级持久化） */
  list: invoke<(appId: string) => AppPermissionState[]>(),
  /** 撤销 App 的全部运行时授权决策（仅 Shell 可调用），下次请求重新询问 */
  reset: invoke<(appId: string) => void>(),

  // ---- Main → Renderer 推送 ----
  /** 全量挂起中的运行时授权请求（授权弹窗浮层窗渲染数据源，空数组 = 无挂起） */
  pendingUpdated: push<[PermissionRequest[]]>(),
})
