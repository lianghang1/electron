import type { AppContext } from './context'
import type { DesktopAppManifest } from './manifest'
import type { Permission } from './permission'
import type { DesktopTab, OpenTabOptions, WorkAreaRect } from './tab'

/**
 * 平台 IPC 契约：Main / Preload / Renderer 三端共享的唯一类型来源。
 *
 * 契约形态：
 * - `channel: (...args) => result` → invoke / handle，请求-响应
 * - `channel: [...args]`           → event，Main 主动推送给 Renderer
 *
 * 安全约定：Main 侧一律根据 event.sender 反查 CallerContext，
 * 契约参数里永远不出现 appId / instanceId / tabId（防 Renderer 伪造身份）。
 */
// 必须是 type alias：Main 侧自研 handle 包装用 keyof/Parameters 提取契约，
// antfu 的 consistent-type-definitions 会把 type alias 转成 interface，
// interface 无隐式索引签名会导致契约提取失效
// eslint-disable-next-line ts/consistent-type-definitions
export type DesktopIpc = {
  // ---- 窗口：始终操作调用来源的窗口 ----
  'window:minimize': () => void
  'window:maximize': () => void
  'window:restore': () => void
  'window:isMaximized': () => boolean
  'window:close': () => void

  // ---- App：应用定义与调用者上下文 ----
  'app:list': () => DesktopAppManifest[]
  'app:getManifest': (appId: string) => DesktopAppManifest | undefined
  'app:getCurrent': () => AppContext

  // ---- Tabs：打开 / 切换 / 刷新 / 关闭 + 容器区域 ----
  'tabs:list': () => DesktopTab[]
  'tabs:open': (options: OpenTabOptions) => DesktopTab
  'tabs:close': (tabId: string) => void
  'tabs:activate': (tabId: string) => void
  'tabs:reload': (tabId: string) => void
  'tabs:setWorkArea': (rect: WorkAreaRect) => void

  // ---- Permission：仅用于 UI 展示，授权以 Main 为准 ----
  'permission:check': (permission: Permission) => boolean

  // ---- Storage：按调用者 App 隔离，值统一走 unknown ----
  'storage:get': (key: string) => unknown
  'storage:set': (key: string, value: unknown) => void
  'storage:remove': (key: string) => void

  // ---- Main → Renderer 推送 ----
  /** Tab 列表任何变化（创建 / 激活 / 关闭）后推送全量列表，UI 直接渲染 */
  'tabs:updated': [DesktopTab[]]
  /** 窗口最大化状态变化（含标题栏双击等系统触发的场景） */
  'window:maximizedChanged': [boolean]
}

/** 契约中 invoke 形态的 channel 子集：Main 侧 handle 包装 / Preload invoke 只看这里 */
export type DesktopInvoke = {
  [
  K in keyof DesktopIpc as DesktopIpc[K] extends (...args: never[]) => unknown ? K : never
  ]: DesktopIpc[K]
}
