import type { DesktopConfig } from '@desktop/shared'
import type { AppRegistry } from '../app/app-registry'
import type { AppService } from '../app/app-service'
import type { CacheService } from '../cache/cache-service'
import type { CaptureSystem } from '../devices/capture'
import type { CaptureDialogSessionService } from '../devices/capture/dialog-session'
import type { IcCardSystem } from '../devices/iccard'
import type { IdCardSystem } from '../devices/idcard'
import type { PrintSystem } from '../devices/print'
import type { ScannerSystem } from '../devices/scanner'
import type { SignatureSystem } from '../devices/signature'
import type { DownloadService } from '../download/download-service'
import type { EventBus } from '../event/event-bus'
import type { Logger } from '../logger/logger'
import type { PermissionService } from '../permission/permission-service'
import type { StorageService } from '../storage/storage-service'
import type { TabService } from '../tab/tab-service'
import type { AsarUpdateService } from '../updater/asar-update-service'
import type { UpdateService } from '../updater/update-service'
import type { WebService } from '../web/web-service'
import type { OverlayWindowService } from '../window/overlay-window'
import type { CallerResolver } from './caller-context'
import { registerAppIpc } from './app'
import { registerCacheIpc } from './cache'
import { registerCaptureIpc } from './capture'
import { registerDownloadIpc } from './download'
import { registerIccardIpc } from './iccard'
import { registerIdcardIpc } from './idcard'
import { registerNotificationIpc } from './notification'
import { registerOverlayIpc } from './overlay'
import { registerPermissionIpc } from './permission'
import { registerPrintIpc } from './print'
import { registerScannerIpc } from './scanner'
import { registerSignatureIpc } from './signature'
import { registerStorageIpc } from './storage'
import { registerTabsIpc } from './tabs'
import { registerUpdateIpc } from './update'
import { registerWindowIpc } from './window'

export interface PlatformIpcDeps {
  config: DesktopConfig
  registry: AppRegistry
  /** features.tabs = false 时为空：Tab 体系整体不启用 */
  appService?: AppService
  tabService?: TabService
  webService?: WebService
  storageService: StorageService
  cacheService: CacheService
  permissionService: PermissionService
  /** updates.url 未配置时为空：整包更新通道不注册 */
  updateService?: UpdateService
  /** updates.asar 未配置时为空：asar 热更通道不注册 */
  asarService?: AsarUpdateService
  /** 浮层窗口服务：全局菜单/弹窗独立原生窗渲染 */
  overlayService: OverlayWindowService
  /** 下载管理：任务面板操作（打开文件 / 定位文件夹）与面板关闭联动 */
  downloadService: DownloadService
  /** 身份证阅读系统（bootstrap 装配）：未配置时通道以 ADAPTER_UNAVAILABLE 拒绝 */
  idcard?: IdCardSystem
  /** IC 卡读写系统（bootstrap 装配）：未配置时通道以 ADAPTER_UNAVAILABLE 拒绝 */
  iccard?: IcCardSystem
  /** 手写签名系统（bootstrap 装配）：未配置时签名通道返回不可用结果 */
  signature?: SignatureSystem
  /** 扫码枪系统（bootstrap 装配，恒创建） */
  scanner: ScannerSystem
  /** 图像采集系统（bootstrap 装配，恒创建） */
  capture: CaptureSystem
  /** 拍摄浮层会话服务（bootstrap 装配，恒创建） */
  captureDialog: CaptureDialogSessionService
  /** 统一打印系统（bootstrap 装配，恒创建） */
  print: PrintSystem
  /** 平台事件总线：通知等域经它把 Main 侧事件转推 Shell */
  events: EventBus
  /** 平台日志根：域实现内异步动作失败留痕（如菜单动作执行失败） */
  logger: Logger
  resolver: CallerResolver
}

/**
 * 平台 IPC 注册编排：每行一个能力域，契约与实现在本目录同名文件一一对应
 * （window.ts / tabs.ts / ... ↔ shared/types/ipc/ 同名契约）。
 * 新增能力 = 新建域文件（抄任意现有域结构）+ 这里加一行；
 * 条件启用（Tab 未装配 / 更新未配置）由各域文件自行判断。
 */
export function registerPlatformIpc(deps: PlatformIpcDeps): void {
  registerWindowIpc()
  registerAppIpc({
    config: deps.config,
    registry: deps.registry,
    appService: deps.appService,
    permissionService: deps.permissionService,
    resolver: deps.resolver,
  })
  registerTabsIpc({ tabService: deps.tabService, webService: deps.webService, resolver: deps.resolver })
  registerOverlayIpc({
    overlayService: deps.overlayService,
    captureDialog: deps.captureDialog,
    registry: deps.registry,
    tabService: deps.tabService,
    cacheService: deps.cacheService,
    logger: deps.logger,
    resolver: deps.resolver,
  })
  registerPermissionIpc({ permissionService: deps.permissionService, overlayService: deps.overlayService, resolver: deps.resolver })
  registerStorageIpc({ storageService: deps.storageService, permissionService: deps.permissionService, resolver: deps.resolver })
  registerCacheIpc({ cacheService: deps.cacheService, registry: deps.registry, tabService: deps.tabService, resolver: deps.resolver })
  registerUpdateIpc({ updateService: deps.updateService, asarService: deps.asarService, resolver: deps.resolver })
  registerDownloadIpc({ downloadService: deps.downloadService, overlayService: deps.overlayService, resolver: deps.resolver })
  registerIdcardIpc({ idcard: deps.idcard })
  registerIccardIpc({ iccard: deps.iccard })
  registerSignatureIpc({ signature: deps.signature })
  registerScannerIpc({ scanner: deps.scanner })
  registerCaptureIpc({
    capture: deps.capture,
    captureDialog: deps.captureDialog,
    overlayService: deps.overlayService,
    registry: deps.registry,
    resolver: deps.resolver,
  })
  registerPrintIpc({ print: deps.print })
  registerNotificationIpc({
    registry: deps.registry,
    permissionService: deps.permissionService,
    events: deps.events,
    resolver: deps.resolver,
    overlayService: deps.overlayService,
  })
}
