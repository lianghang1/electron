/**
 * 平台权限词汇表：App 级权限，由 Main 的 PermissionService 做最终校验。
 * Renderer 侧的权限状态只用于 UI 展示，不作为授权依据。
 *
 * 列表即类型的唯一来源：新增权限只改这一个数组。
 */
export const PERMISSIONS = [
  'storage',
  'clipboard.read',
  'clipboard.write',
  'notification',
  'window',
  'network',
  'download',
  'upload',
  'filesystem.read',
  'filesystem.write',
  'media',
  'geolocation',
  'fullscreen',
  'pointerLock',
  'display-capture',
] as const

export type Permission = (typeof PERMISSIONS)[number]

/** 运行时权限请求（Main → Shell 推送负载）：App 未在 manifest 声明的权限，询问用户授权 */
export interface PermissionRequest {
  requestId: string
  appId: string
  appName: string
  permission: Permission
  requestedAt: number
}

/** App 权限状态（permission:list 负载）：声明 + 运行时用户决策的合成视图 */
export interface AppPermissionState {
  permission: Permission
  /** 是否在 manifest 声明（声明 = 直接放行） */
  declared: boolean
  /** 运行时用户决策：true 允许 / false 拒绝 / null 未询问过（决策持久化在平台侧） */
  granted: boolean | null
}
