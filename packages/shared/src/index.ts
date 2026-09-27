/**
 * @desktop/shared — 跨 Main / Preload / Renderer 的公共契约与纯代码。
 *
 * 硬性约束：
 * - 禁止依赖 electron / node API（BrowserWindow / Session 等运行时对象禁止出现）
 * - 本包会被打进各端 bundle，只放类型和与平台无关的纯代码（如 DesktopError）
 *
 * 导出按域分区，全部是 main ↔ renderer 的接口契约：
 * 错误基类 → API 形状 → 配置/上下文 → 能力域（设备/下载/更新/权限/Tab）→ App 清单
 */

/* ---------------- 错误基类（唯一运行时值） ---------------- */

export { DesktopError } from './errors'
export type { DesktopErrorCode } from './errors'

/* ---------------- 对外 API 契约（invoke 通道形状 / 事件表） ---------------- */

export type { DesktopApi, DesktopEvents } from './types/api'
export type { DesktopConfig } from './types/config'

/* ---------------- 配置与调用方上下文 ---------------- */

export type { AppContext, AppInstance, AppLifecycleState, CallerContext } from './types/context'
export type { DeviceIdCard, DevicePrintTicket } from './types/device'

/* ---------------- 设备通道（device:*，读卡器 / 打印机） ---------------- */

export type { DownloadTask, DownloadTaskStatus } from './types/download'

/* ---------------- 下载任务 ---------------- */

export type { DesktopInvoke, DesktopIpc } from './types/ipc'

/* ---------------- 更新（整包 + asar 热更） ---------------- */

export type { AppSource, DesktopAppManifest, RegisteredApp } from './types/manifest'

/* ---------------- 运行时权限 ---------------- */

export { PERMISSIONS } from './types/permission'
export type { AppPermissionState, Permission, PermissionRequest } from './types/permission'

/* ---------------- Tab 会话 ---------------- */

export type { AppSecurityPolicy } from './types/security'

/* ---------------- App 清单与来源（多 App 注册） ---------------- */

export type { DesktopTab, OpenTabOptions, WorkAreaRect } from './types/tab'

/* ---------------- 安全策略 ---------------- */

export type { AsarUpdateState, UpdateManifest, UpdateState } from './types/update'
