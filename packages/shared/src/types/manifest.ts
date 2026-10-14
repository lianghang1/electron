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
   * Shell 外壳形态：full = 完整外壳（左侧导航 + 顶栏，默认）；
   * single = 套壳模式，该 App 的 Tab 激活时隐藏外壳、Web 铺满窗口
   * （顶栏保留固定 Tab 条与窗口控制，Tab 不可关闭，右键菜单无「关闭标签页」）
   */
  chrome?: 'full' | 'single'
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
