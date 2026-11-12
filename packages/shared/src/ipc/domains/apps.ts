import type { AppManifest } from '../../manifest'
import type { IpcDefs, IpcDomainValue } from '../contract'
import { defineIpcDomain, invoke } from '../contract'

/** 应用清单行（应用运行时 RegisteredApp 投影：跨 IPC 只出纯数据） */
export interface AppRegistrationRow {
  manifest: AppManifest
  source: string
}

/** open 返回值是 IPC 边界投影：实例内部持有视图/窗口引用不可克隆，只出渲染层需要的纯数据 */
export interface AppOpenProjection {
  instanceId: string
  appId: string
  state: 'opening' | 'opened' | 'closing' | 'closed'
  handle: Record<string, unknown>
}

/**
 * 应用运行时域契约：打开 / 关闭 / 激活 / 清单（注册实现在 main 组合根 AppService 装配处）。
 */
export const appsDomain = defineIpcDomain('apps', {
  list: invoke<() => AppRegistrationRow[]>(),
  open: invoke<(appId: string) => AppOpenProjection>(),
  close: invoke<(instanceId: string) => void>(),
  /** 切到某实例的视图（embedded 切换由渲染层本地完成，无需过桥） */
  activate: invoke<(instanceId: string) => void>(),
}) satisfies IpcDomainValue<'apps', IpcDefs>
