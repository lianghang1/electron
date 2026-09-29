import type { AppIpc } from './app'
import type { CacheIpc } from './cache'
import type { DeviceIpc } from './device'
import type { DownloadIpc } from './download'
import type { NotificationIpc } from './notification'
import type { OverlayIpc } from './overlay'
import type { PermissionIpc } from './permission'
import type { StorageIpc } from './storage'
import type { TabsIpc } from './tabs'
import type { UpdateIpc } from './update'
import type { WindowIpc } from './window'

/**
 * 平台 IPC 契约：Main / Preload / Renderer 三端共享的唯一类型来源。
 * 按能力域拆分在本目录，域文件与 core/src/ipc/ 的注册实现同名对应。
 * 新增能力 = 新建域契约文件 + 下方并集加一行。
 *
 * 契约形态：
 * - `channel: (...args) => result` → invoke / handle，请求-响应
 * - `channel: [...args]`           → event，Main 主动推送给 Renderer
 *
 * 安全约定：Main 侧一律根据 event.sender 反查 CallerContext，
 * 契约参数里永远不出现 appId / instanceId / tabId（防 Renderer 伪造身份）。
 */
export type DesktopIpc
  = & WindowIpc
    & AppIpc
    & TabsIpc
    & PermissionIpc
    & StorageIpc
    & UpdateIpc
    & DeviceIpc
    & DownloadIpc
    & CacheIpc
    & OverlayIpc
    & NotificationIpc

/** 契约中 invoke 形态的 channel 子集：Main 侧 handle 包装 / Preload invoke 只看这里 */
export type DesktopInvoke = {
  [
  K in keyof DesktopIpc as DesktopIpc[K] extends (...args: never[]) => unknown ? K : never
  ]: DesktopIpc[K]
}
