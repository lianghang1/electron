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
] as const

export type Permission = (typeof PERMISSIONS)[number]
