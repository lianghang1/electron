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
  /**
   * 自定义协议处理器（scheme → handler）：注册到每个 App 的 persist 分区 Session 上。
   * Electron 顶层 protocol API 只作用于 defaultSession，分区 Session 必须逐个挂；
   * core 在 Session 创建的咽喉位置统一注册（幂等）。
   * 典型用途：内部静态页走 app:// 标准源加载（standard+secure 使 cookie/origin 语义等同 https）。
   */
  protocols?: Record<string, (request: Request) => Promise<Response>>
  /**
   * 硬件设备（设备通用层 device:*）。资源根统一经 resolveResourcePath 解析，
   * DLL / 外置 exe 均相对 resourcesRoot 寻址；模拟设备零隐式注册（仅显式开关驱动）。
   */
  devices?: {
    /**
     * SDK 资源根（厂商 DLL 与外置 exe 的共同基准目录）：缺省 resources/ ——
     * dev 为 <应用根>/resources，打包为 <resourcesPath>/resources。
     * DLL 位置如 devices/huashi/Termb.dll，外置 exe 如 devices/print/SumatraPDF.exe。
     */
    resourcesRoot?: string
    /** 注册内置 stub 模拟设备（读卡器 + 采集，无硬件联调/演示用）；缺省不注册，正式环境零模拟 */
    mock?: boolean
    /** 摄像采集（capture 域） */
    capture?: { saveDir?: string }
    /** 打印（print 域） */
    print?: {
      /** SumatraPDF 可执行文件位置（PDF 打印后端）：相对 resourcesRoot（缺省 devices/print/SumatraPDF.exe）或绝对路径 */
      sumatraPath?: string
    }
  }
}

/**
 * 应用启动配置：DesktopConfig 是平台统一配置面，WindowOverrides 是
 * Electron 逃生口，二者平铺在 bootstrap 的入参上。
 */
export interface BootstrapOptions extends DesktopConfig, WindowOverrides {}
