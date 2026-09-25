import type { Permission } from './permission'
import type { AppSecurityPolicy } from './security'

/**
 * App 定义（App Registry 的注册单元）。
 * id / entry / permissions 是平台识别和管理一个 App 的最小集合。
 */
export interface DesktopAppManifest {
  id: string
  name: string
  version: string
  /** internal：平台自己人；third-party：外部接入方，默认按更严格策略处理 */
  type: 'internal' | 'third-party'
  entry: {
    type: 'web'
    url: string
  }
  icon?: string
  /** App 声明需要的平台权限，实际放行以 Main 的 PermissionService 为准 */
  permissions?: Permission[]
  security?: AppSecurityPolicy
}
