import type { AppContext } from './context'
import type { DesktopIpc } from './ipc'
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
  update: {
    /** 手动触发检查更新 */
    check: () => Promise<void>
    /** 下载完成后重启安装 */
    install: () => Promise<void>
  }
  events: {
    /** 监听平台推送事件，返回取消监听函数 */
    on: <K extends keyof DesktopEvents>(channel: K, listener: DesktopEvents[K]) => () => void
  }
}
