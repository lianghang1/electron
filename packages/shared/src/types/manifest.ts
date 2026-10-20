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
  /**
   * App 形态：app = 常规应用（默认，进左侧导航与应用中心）；
   * resource = 资源直嵌——直接嵌入打开的网页，启动自动打开为固定 Tab（不可关闭），
   * 不进左侧导航与应用中心，Shell 只保留头部 Tab 条与窗口控制。
   */
  kind?: 'app' | 'resource'
  /** App 声明需要的平台权限，实际放行以 Main 的 PermissionService 为准 */
  permissions?: Permission[]
  security?: AppSecurityPolicy
}

/** App 注册来源：代码内置 / 本地 apps.json / 远程应用中心 */
export type AppSource = 'code' | 'apps.json' | 'remote'

/** 注册表条目：App 定义 + 来源（应用中心 UI 展示用） */
export interface RegisteredApp {
  manifest: DesktopAppManifest
  source: AppSource
}
