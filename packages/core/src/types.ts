import type { DesktopConfig } from '@desktop/shared'
import type { BrowserWindowConstructorOptions, WebPreferences } from 'electron'
import type { CardReaderDriver, PrinterDriver } from './device/driver'

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
  /**
   * 自定义协议处理器（scheme → handler）：注册到每个 App 的 persist 分区 Session 上。
   * Electron 顶层 protocol API 只作用于 defaultSession，分区 Session 必须逐个挂；
   * core 在 Session 创建的咽喉位置统一注册（幂等）。
   * 典型用途：内部静态页走 app:// 标准源加载（standard+secure 使 cookie/origin 语义等同 https）。
   */
  protocols?: Record<string, (request: Request) => Promise<Response>>
  /**
   * 硬件驱动注入（设备通用层 device:*）：缺省用平台内置 mock。
   * 对接真实设备 SDK 时在此注入对应 Driver 实现，契约与业务页不动。
   */
  devices?: {
    cardReader?: CardReaderDriver
    printer?: PrinterDriver
  }
}

/**
 * 应用启动配置：DesktopConfig 是平台统一配置面，WindowOverrides 是
 * Electron 逃生口，二者平铺在 bootstrap 的入参上。
 */
export interface BootstrapOptions extends DesktopConfig, WindowOverrides {}
