import type { AppService, PermissionService } from '@shell/app-runtime'
import type { DeviceGateway, DeviceTelemetry, DomainRouter } from '@shell/devices'
import type { AppKvStore, NotificationCenter, PlatformKernel } from '@shell/kernel'
import type { DownloadManager } from '@shell/kernel/download'
import type { Logger } from '@shell/kernel/logger'
import type { AppSessionRegistry } from '@shell/kernel/session'
import type { CallerRegistry, FlavorManifest, PlatformCapability } from '@shell/shared'
import type { ForceUpdateGate, UpdateCenter } from '@shell/update'
import type { WindowSystem } from '@shell/window'
import { attachShellHandleLogger } from '@shell/bridge/handle'
import { registerSettingsIpc } from '@shell/kernel/settings'
import { ipcMain } from 'electron'
import { registerAppsIpc } from './ipc/apps'
import { registerCaptureDialogIpc } from './ipc/capture-dialog'
import { registerDeviceConfigIpc } from './ipc/device-config'
import { registerDownloadsIpc } from './ipc/downloads'
import { registerNotificationsIpc } from './ipc/notifications'
import { registerPermissionsIpc } from './ipc/permissions'
import { registerRouterIpc } from './ipc/router'
import { registerSessionsIpc } from './ipc/sessions'
import { registerShellInfoIpc } from './ipc/shell'
import { registerStorageIpc } from './ipc/storage'
import { registerSystemIpc } from './ipc/system'
import { registerTabsIpc } from './ipc/tabs'
import { registerUpdateIpc } from './ipc/update'

/**
 * 壳设施 IPC 接线编排（组合根装配后的现场）：每行一个能力域，域实现见 ./ipc/ 同名文件，
 * 通道经 registerIpcDomain 按契约运行时表接线（零通道字面量），异常经统一出口编码过桥。
 * 设备域与 JSAPI 单通道（domain-call / jsapi:call）为基础设施白名单通道，保留各自错误语义。
 * 组合根只负责创建与传参；本模块只做编排，不 new 任何系统。
 */

/** 组合根装配完成的系统集合（创建集中在此处消费，依赖单向） */
export interface ShellIpcDeps {
  logger: Logger
  kernel: PlatformKernel
  callers: CallerRegistry
  router: DomainRouter
  apps: AppService
  windows: WindowSystem
  downloads: DownloadManager
  appSessions: AppSessionRegistry
  permissions: PermissionService
  appKv: AppKvStore
  notifications: NotificationCenter
  updateCenter: UpdateCenter | undefined
  forceGate: ForceUpdateGate | undefined
  capability: PlatformCapability
  devices: DeviceGateway
  telemetry: DeviceTelemetry
  flavor: FlavorManifest
  version: () => string
  markGracefulExit: () => void
}

export function registerShellIpc(deps: ShellIpcDeps): void {
  attachShellHandleLogger(deps.logger)

  registerAppsIpc({ apps: deps.apps, windows: deps.windows })
  registerDownloadsIpc({ downloads: deps.downloads })
  registerSessionsIpc({ apps: deps.apps, appSessions: deps.appSessions, kernel: deps.kernel })
  registerShellInfoIpc({
    kernel: deps.kernel,
    capability: deps.capability,
    devices: deps.devices,
    telemetry: deps.telemetry,
    flavor: deps.flavor,
    version: deps.version,
    updateCenter: deps.updateCenter,
    forceGate: deps.forceGate,
    markGracefulExit: deps.markGracefulExit,
  })
  registerSystemIpc({ kernel: deps.kernel, logger: deps.logger, windows: deps.windows })
  registerTabsIpc({ callers: deps.callers, windows: deps.windows })
  registerStorageIpc({ callers: deps.callers, permissions: deps.permissions, appKv: deps.appKv })
  registerNotificationsIpc({ callers: deps.callers, permissions: deps.permissions, notifications: deps.notifications })
  registerUpdateIpc({ callers: deps.callers, updateCenter: deps.updateCenter, markGracefulExit: deps.markGracefulExit })
  registerPermissionsIpc({ callers: deps.callers, permissions: deps.permissions })
  registerDeviceConfigIpc({ callers: deps.callers, devices: deps.devices, flavor: deps.flavor })
  registerCaptureDialogIpc({ callers: deps.callers, apps: deps.apps, devices: deps.devices })
  registerRouterIpc({ callers: deps.callers, logger: deps.logger, router: deps.router, apps: deps.apps })

  // 设置通道（schema 驱动）：kernel settings 服务经注入的 ipc 接口注册
  registerSettingsIpc(ipcMain)
}
