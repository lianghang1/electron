/**
 * @desktop/shared — 跨 Main / Preload / Renderer 的公共类型与纯代码。
 *
 * 硬性约束：
 * - 禁止依赖 electron / node API（BrowserWindow / Session 等运行时对象禁止出现）
 * - 本包会被打进各端 bundle，只放类型和与平台无关的纯代码（如 DesktopError）
 */
export { DesktopError } from './errors'
export type { DesktopErrorCode } from './errors'
export type { DesktopApi, DesktopEvents } from './types/api'
export type { DesktopConfig } from './types/config'
export type { AppContext, AppInstance, AppLifecycleState, CallerContext } from './types/context'
export type { DeviceIdCard, DevicePrintTicket } from './types/device'
export type { DownloadTask, DownloadTaskStatus } from './types/download'
export type { DesktopInvoke, DesktopIpc } from './types/ipc'
export type { AppSource, DesktopAppManifest, RegisteredApp } from './types/manifest'
export { PERMISSIONS } from './types/permission'
export type { AppPermissionState, Permission, PermissionRequest } from './types/permission'
export type { AppSecurityPolicy } from './types/security'
export type { DesktopTab, OpenTabOptions, WorkAreaRect } from './types/tab'
export type { AsarUpdateState, UpdateManifest, UpdateState } from './types/update'
