import type { DesktopDomains } from './ipc'
import type { DesktopAppManifest } from './manifest'
import type { Permission } from './permission'

/**
 * IPC 调用者身份：由 Main 根据 IPC 来源（event.sender）反查得出。
 * 不信任 Renderer 自己传入的 appId / instanceId / tabId，防止伪造身份。
 */
export interface CallerContext {
  appId: string
  instanceId: string
  tabId?: string
  /** 挂载的域清单：Main 创建窗口 / Web 容器时登记，与 preload 的 --desktop-domains 启动参数同源 */
  domains: DesktopDomains
}

/** 平台提供给 App 的运行上下文快照（可通过 IPC 返回给 Renderer） */
export interface AppContext {
  appId: string
  instanceId: string
  manifest: DesktopAppManifest
  permissions: Permission[]
  createdAt: number
}

/** App 运行生命周期：registered → opening → opened → closing → closed */
export type AppLifecycleState = 'registered' | 'opening' | 'opened' | 'closing' | 'closed'

/**
 * 正在运行的 App 实例。
 * instanceId 与 appId 必须是两个独立标识：第一阶段一个 App 默认只有一个
 * 活跃 Instance，但模型不能把两者写死成同一个东西。
 */
export interface AppInstance {
  instanceId: string
  appId: string
  state: AppLifecycleState
  createdAt: number
}
