import type { AppContext } from './context'
import type { DeviceIdCard, DevicePrintTicket } from './device'
import type { DesktopIpc } from './ipc'
import type { OverlayMenuConfig } from './ipc/overlay'
import type { DesktopAppManifest, RegisteredApp } from './manifest'
import type { AppPermissionState, Permission } from './permission'
import type { DesktopTab, OpenTabOptions, WorkAreaRect } from './tab'
/**
 * Renderer 可监听的平台推送事件：从契约中数组形态的 channel 自动推导，
 * 与 Main 侧 emit 保持单一来源。
 */
export type DesktopEvents = {
  [K in keyof DesktopIpc as DesktopIpc[K] extends unknown[] ? K : never]: (
    ...args: DesktopIpc[K] extends unknown[] ? DesktopIpc[K] : never
  ) => void
}

/**
 * window.desktop 桥的类型：Preload 按它实现，Renderer 按它消费。
 * 每个分组对应一类平台服务；权限 / 存储等敏感能力的实际授权都在 Main。
 */
export interface DesktopApi {
  window: {
    minimize: () => Promise<void>
    maximize: () => Promise<void>
    restore: () => Promise<void>
    close: () => Promise<void>
    isMaximized: () => Promise<boolean>
  }
  app: {
    list: () => Promise<RegisteredApp[]>
    getManifest: (appId: string) => Promise<DesktopAppManifest | undefined>
    getCurrent: () => Promise<AppContext>
  }
  tabs: {
    list: () => Promise<DesktopTab[]>
    open: (options: OpenTabOptions) => Promise<DesktopTab>
    close: (tabId: string) => Promise<void>
    activate: (tabId: string) => Promise<void>
    reload: (tabId: string) => Promise<void>
    setWorkArea: (rect: WorkAreaRect) => Promise<void>
  }
  permission: {
    check: (permission: Permission) => Promise<boolean>
    /** 对运行时权限请求做出用户决策 */
    respond: (requestId: string, granted: boolean) => Promise<void>
    /** App 权限状态列表（声明 + 运行时决策合成视图） */
    list: (appId: string) => Promise<AppPermissionState[]>
  }
  storage: {
    get: <T>(key: string) => Promise<T | undefined>
    set: <T>(key: string, value: T) => Promise<void>
    remove: (key: string) => Promise<void>
    /** 清空调用者 App 的全部本地存储 */
    clear: () => Promise<void>
  }
  /**
   * 缓存清理（Shell 专属管理动作）：对应浏览器「清除浏览数据」，作用域为单个容器。
   * 目标 appId 由 Shell 指定，App 无权发起清理。
   */
  cache: {
    /** 清容器可再生缓存（HTTP / 图片缓存），不影响登录态 */
    clear: (appId: string) => Promise<void>
    /** 清容器站点数据（cookie / localStorage 等），等于该容器登出，完成后容器自动重载 */
    clearSite: (appId: string) => Promise<void>
  }
  update: {
    /** 手动触发检查更新 */
    check: () => Promise<void>
    /** 下载完成后重启安装 */
    install: () => Promise<void>
  }
  /**
   * 设备通用层（读卡器/打印机等硬件，各 App 复用）。
   * handler 由 core 设备服务注册：缺省内置 mock，可通过 bootstrap.devices 注入真实 Driver。
   */
  device: {
    /** 读身份证/接触式卡，无卡或读卡失败返回 null */
    readIdCard: () => Promise<DeviceIdCard | null>
    /** 打印票据（份数与行数超限会被平台钳制/拒绝） */
    print: (ticket: DevicePrintTicket) => Promise<void>
  }
  /**
   * 浮层域：全局菜单/弹窗渲染进独立透明原生窗（OverlayWindow），
   * 原生层级永远盖过 WebContentsView，Shell DOM 不再承载全局浮层。
   */
  overlay: {
    /** Shell 发起：在视口坐标处弹出浮层菜单（Main 换算屏幕坐标并显示） */
    showMenu: (config: OverlayMenuConfig) => Promise<void>
    /** 收起浮层菜单 */
    hideMenu: () => Promise<void>
    /** 仅供 OverlayWindow 页面回传用户动作（Main 校验来源，Shell 调用无效） */
    action: (itemId: string) => Promise<void>
  }
  /**
   * App 业务通道统一入口：调用 bootstrap 时经 preload 白名单声明的业务通道
   * （app 本地契约，如 fh:order:query）。平台不感知业务词汇，类型由 App 侧封装收口。
   */
  $invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
  events: {
    /** 监听平台推送事件，返回取消监听函数 */
    on: <K extends keyof DesktopEvents>(channel: K, listener: DesktopEvents[K]) => () => void
  }
}
