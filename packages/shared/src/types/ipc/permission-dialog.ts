import type { PermissionRequest } from '../permission'
import { defineDomain, invoke, push } from '../../domain'

/**
 * permissionDialog 域契约 —— 运行时授权弹窗窗专属（全屏遮罩模态）。
 * 决策回传与挂起请求渲染数据源；permission 域保留状态查询（Shell 管理面）。
 * 文件与 core/src/ipc/permission-dialog.ts（注册实现）一一对应。
 */
export const permissionDialogDomain = defineDomain('permissionDialog', {
  /** 弹窗窗回传：用户对运行时权限请求的决策（Main 落库并刷新挂起列表推送） */
  respond: invoke<(requestId: string, granted: boolean) => void>(),
  /** 弹窗窗 mounted 后拉取挂起中的授权请求（对账推送竞态） */
  sync: invoke<() => PermissionRequest[]>(),

  // ---- Main → Renderer 推送 ----
  /** 全量挂起中的运行时授权请求（弹窗窗渲染数据源，null 语义无需：空数组 = 无挂起） */
  pending: push<[PermissionRequest[]]>(),
})
