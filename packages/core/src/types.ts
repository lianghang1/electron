import type { DesktopConfig } from '@desktop/shared'
import type { BrowserWindowConstructorOptions, WebPreferences } from 'electron'

/**
 * Electron 原生层的「逃生口」：普通业务用不到，用于覆盖 core 的窗口默认值。
 * 平台统一配置（app/window/apps）走 DesktopConfig；这里只放 Electron 差异项。
 */
export interface WindowOverrides {
  /** linux 窗口图标（传 `?asset` 导入的资源路径） */
  icon?: string
  /** 直接透传给 BrowserWindow 的构造参数，覆盖同名默认值 */
  browserWindowOptions?: BrowserWindowConstructorOptions
  /** 追加的 webPreferences，在安全默认值之上合并 */
  webPreferences?: Partial<WebPreferences>
  /**
   * Electron session 权限放行策略（默认全拒）：
   * - 'all'：全部放行，适合内部可信应用
   * - 传数组：按需放行，如 ['media', 'notifications']
   * - 不传：全部拒绝，适合会加载不可信内容的应用
   * 常用权限名：'media'（摄像头/麦克风）、'notifications'、'geolocation'、
   * 'display-capture'（录屏）、'clipboard-read'（读剪贴板）
   */
  permissions?: 'all' | string[]
}

/**
 * 应用启动配置：DesktopConfig 是平台统一配置面，WindowOverrides 是
 * Electron 逃生口，二者平铺在 bootstrap 的入参上。
 */
export interface BootstrapOptions extends DesktopConfig, WindowOverrides {}
