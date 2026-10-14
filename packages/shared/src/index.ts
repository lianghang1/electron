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

export { createDomainApi, defineDomain, invoke, push } from './domain'
export type {
  DomainApi,
  DomainContract,
  DomainDefs,
  DomainIpc,
  DomainValue,
  InvokeSig,
  PushSig,
  SigOf,
} from './domain'

/* ---------------- 对外 API 契约（invoke 通道形状 / 事件表） ---------------- */

export { decodeIpcError, DesktopError, encodeIpcError, IpcRemoteError } from './errors'
export type { DesktopErrorCode, IpcErrorPayload } from './errors'

/* ---------------- 域契约定义原语（defineDomain：契约定义即映射） ---------------- */

export type { DesktopApi, DesktopEvents } from './types/api'
export type { DesktopConfig } from './types/config'
export type { AppContext, AppInstance, AppLifecycleState, CallerContext } from './types/context'

/* ---------------- 配置与调用方上下文 ---------------- */

export type {
  CaptureAdapter,
  CaptureCameraInfo,
  CaptureCaps,
  CaptureDevice,
  CaptureDeviceProfile,
  CaptureErrorCode,
  CaptureLogFn,
  CaptureRequest,
  CaptureResult,
  CaptureTransport,
} from './types/devices/capture'

/* ---------------- 设备类型（scanner / capture / print） ---------------- */

export type { IcCardData, IcCardReadRequest, IcCardWriteRequest, IdCardData, IdReaderDevice, IdReaderErrorCode, IdReaderTransport } from './types/devices/idcard'
export type {
  ChannelId,
  ChannelPreference,
  FilePayload,
  HardwareControls,
  HtmlPayload,
  JobStatus,
  Overlay,
  PaperSpec,
  PrinterCaps,
  PrinterDefaults,
  PrinterPaper,
  PrintError,
  PrintErrorCode,
  PrintLogFn,
  PrintOptions,
  PrintPayload,
  PrintRequest,
  PrintResult,
  RawPayload,
  RawPrinterConfig,
  TemplatePayload,
  UnifiedPrinter,
  UrlPayload,
} from './types/devices/print'
export type { ScanErrorCode, ScannerConfig, ScannerLogFn, ScanOptions, ScanResult } from './types/devices/scanner'
export type { SignDevice, SignDeviceTransport, SignErrorCode, SignSessionResult, SignStartResult, SignStroke, SignStrokePoint } from './types/devices/signature'

/* ---------------- 设备通道（device:*，读卡器 / 打印机） ---------------- */

export type { DownloadTask, DownloadTaskStatus } from './types/download'

export { captureDomain, deviceDomain, platformDomains, printDomain, scannerDomain } from './types/ipc'

/* ---------------- 下载任务 ---------------- */

export type { DesktopInvoke, DesktopIpc } from './types/ipc'

/* ---------------- 浮层（OverlayWindow 独立原生窗） ---------------- */

export type { OverlaySyncState, TabContextMenu, TabMenuAction } from './types/ipc/overlay'

/* ---------------- App 清单与来源（多 App 注册） ---------------- */

export type { AppSource, DesktopAppManifest, RegisteredApp } from './types/manifest'

/* ---------------- 平台通知（Shell 应用内 toast） ---------------- */

export type { PlatformNotification } from './types/notification'

/* ---------------- 运行时权限 ---------------- */

export { PERMISSIONS } from './types/permission'
export type { AppPermissionState, Permission, PermissionRequest } from './types/permission'

/* ---------------- 安全策略 ---------------- */

export type { AppSecurityPolicy } from './types/security'

/* ---------------- Tab 会话 ---------------- */

export type { DesktopTab, OpenTabOptions, WorkAreaRect } from './types/tab'

/* ---------------- 更新（整包 + asar 热更） ---------------- */

export type { AsarUpdateState, UpdateAsarSource, UpdateManifest, UpdateState } from './types/update'
