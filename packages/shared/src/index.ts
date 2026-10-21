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

/* ---------------- 展示工具（浮层 / 应用页共用） ---------------- */

export { formatBytes } from './format'
export { buildOverlayHash, OVERLAY_HASH, parseOverlayHash } from './overlay-contract'

/* ---------------- 浮层窗契约与权限文案（OverlayWindow 独立原生窗 / 应用页共用） ---------------- */

export type { OverlayWindowKind } from './overlay-contract'
export { PERMISSION_LABELS, permissionLabel } from './permission-labels'
export type { DesktopApi, DesktopEvents } from './types/api'

/* ---------------- 域契约定义原语（defineDomain：契约定义即映射） ---------------- */

export type { DesktopConfig } from './types/config'
export type { AppContext, AppInstance, AppLifecycleState, CallerContext } from './types/context'
export type {
  AdapterCaptureRequest,
  CaptureAdapter,
  CaptureCameraInfo,
  CaptureCaps,
  CaptureDevice,
  CaptureDeviceConfig,
  CaptureDeviceOverrides,
  CaptureDialogClosedReason,
  CaptureDialogRequest,
  CaptureDialogSession,
  CaptureDllBinary,
  CaptureErrorCode,
  CaptureLogFn,
  CaptureRequest,
  CaptureResult,
  CaptureTransport,
} from './types/devices/capture'

/* ---------------- 配置与调用方上下文 ---------------- */

export type { IccardConfig, IcCardData, IccardDeviceOverrides, IcCardErrorCode, IcCardReadRequest, IcCardReadResult, IcCardTextsWriteRequest, IcCardWriteRequest, IcReaderDeviceConfig, IcReaderDllProfile, IcReaderWsProfile } from './types/devices/iccard'

/* ---------------- 设备类型（idcard / iccard / scanner / capture / print / signature） ---------------- */

export type { IdcardConfig, IdCardData, IdcardDeviceConfig, IdcardDeviceOverrides, IdcardDllProfile, IdcardWsProfile, IdReaderDevice, IdReaderErrorCode, IdReaderTransport } from './types/devices/idcard'
export type {
  ChannelId,
  ChannelPreference,
  FilePayload,
  HtmlPayload,
  JobStatus,
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
  UnifiedPrinter,
  UrlPayload,
} from './types/devices/print'
export type { ScanErrorCode, ScannerChannelMode, ScannerConfig, ScannerDeviceConfig, ScannerDeviceOverrides, ScannerLogFn, ScannerOverrides, ScannerSetInput, ScannerStatus, ScanOptions, ScanResult } from './types/devices/scanner'
export type { SignatureConfig, SignatureDeviceOverrides, SignDevice, SignDeviceConfig, SignDeviceTransport, SignDllProfile, SignErrorCode, SignSessionResult, SignStartResult, SignStroke, SignStrokePoint, SignWsProfile } from './types/devices/signature'
export type { DownloadTask, DownloadTaskStatus } from './types/download'

/* ---------------- 设备通道（idcard / iccard / print / scanner / capture / signature 域） ---------------- */

export { captureDomain, iccardDomain, idcardDomain, platformDomains, printDomain, scannerDomain } from './types/ipc'

export type { DesktopInvoke, DesktopIpc } from './types/ipc'

/* ---------------- 下载任务 ---------------- */

export type { DeviceConfigKind, OverlaySyncState, TabContextMenu, TabMenuAction } from './types/ipc/overlay'
export type { AppSource, DesktopAppManifest, RegisteredApp } from './types/manifest'

/* ---------------- App 清单与来源（多 App 注册） ---------------- */

export type { PlatformNotification } from './types/notification'

/* ---------------- 平台通知（Shell 应用内 toast） ---------------- */

export { PERMISSIONS } from './types/permission'

/* ---------------- 运行时权限 ---------------- */

export type { AppPermissionState, Permission, PermissionRequest } from './types/permission'
export type { AppSecurityPolicy } from './types/security'

/* ---------------- 安全策略 ---------------- */

export type { DesktopTab, OpenTabOptions, WorkAreaRect } from './types/tab'

/* ---------------- Tab 会话 ---------------- */

export type { AsarBundleManifest, AsarUpdateState, UpdateAsarSource, UpdateManifest, UpdateState } from './types/update'

/* ---------------- 更新（整包 + asar 热更） ---------------- */

export { isWsUrl } from './ws-url'
