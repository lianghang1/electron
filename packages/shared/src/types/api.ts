import type { AppContext } from './context'
import type { DeviceIdCard, DevicePrintTicket } from './device'
import type { DesktopIpc } from './ipc'
import type { OverlaySyncState, TabMenuAction } from './ipc/overlay'
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
    /** 撤销 App 的全部运行时授权决策，下次请求重新询问 */
    reset: (appId: string) => Promise<void>
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
   * 浮层域：消息窗（通知 toast / 下载面板）与授权弹窗渲染进独立透明原生窗
   * （OverlayWindow），原生层级盖过 WebContentsView。仅供浮层窗页面调用。
   */
  overlay: {
    /** 仅供消息窗页面量高回报（Main 据此调整浮层窗尺寸） */
    resize: (height: number) => Promise<void>
    /** 仅供浮层窗页面 mounted 后拉取当前状态（toast / 下载 / 挂起授权请求 / 右键菜单） */
    sync: () => Promise<OverlaySyncState>
    /** 仅供消息窗页面回传：按命中元素切换窗口鼠标穿透（透明区不遮挡下层页面点击） */
    ignoreMouse: (ignore: boolean) => Promise<void>
    /** 仅 Shell 发起：打开 Tab 右键菜单浮层窗（原生窗承载，页面内容保持可见） */
    menu: (menu: { tabId: string, appId: string, x: number, y: number }) => Promise<void>
    /** 仅供菜单窗页面回传：选中菜单项（Main 执行动作后自动关菜单） */
    menuSelect: (action: TabMenuAction) => Promise<void>
    /** 仅供菜单窗页面回传：关闭菜单（ESC / 点击菜单外） */
    menuDismiss: () => Promise<void>
  }
  /**
   * 下载：任务进度经浮层面板展示，完成后可打开文件 / 所在文件夹（浏览器级体验）。
   * 仅浮层窗与 Shell 可调用（Main 校验来源），App 无权触达文件系统。
   */
  download: {
    /** 用系统默认程序打开已完成的下载文件 */
    open: (taskId: string) => Promise<void>
    /** 在资源管理器中定位已完成的下载文件 */
    reveal: (taskId: string) => Promise<void>
    /** 关闭某条下载任务的通知卡片（仅隐藏展示，不影响任务本身） */
    dismiss: (taskId: string) => Promise<void>
  }
  /**
   * 平台通知：App 发起后由平台以浮层 toast 呈现（右下角，全局统一可定制 UI，
   * 不进系统通知中心）。需在 manifest 声明 notification 权限。
   */
  notification: {
    show: (notification: { title: string, body?: string }) => Promise<void>
    /** 仅供浮层面板回传：关闭单条通知（滑动 / 关闭按钮），仅浮层窗调用有效 */
    dismiss: (toastId: string) => Promise<void>
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
