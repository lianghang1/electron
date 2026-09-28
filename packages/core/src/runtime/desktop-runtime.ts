import type { AppSource, DesktopAppManifest } from '@desktop/shared'
import type { Logger } from '../logger/logger'
import type { PermissionStoreSchema } from '../permission/permission-service'
import type { BootstrapOptions } from '../types'
import process from 'node:process'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { app, BrowserWindow } from 'electron'
import Store from 'electron-store'
import { AppRegistry } from '../app/app-registry'
import { AppService } from '../app/app-service'
import { loadLocalAppManifests, loadRemoteAppManifests } from '../app/app-source'
import { AuditService } from '../audit/audit-service'
import { CacheService } from '../cache/cache-service'
import { DeviceService } from '../device/device-service'
import { DownloadService } from '../download/download-service'
import { EventBus } from '../event/event-bus'
import { registerPlatformIpc } from '../ipc'
import { CallerResolver } from '../ipc/caller-context'
import { createRootLogger } from '../logger/logger'
import { attachSystemLogging } from '../logger/system'
import { PermissionService } from '../permission/permission-service'
import { ResilienceService } from '../resilience/resilience'
import { SessionService } from '../session/session-service'
import { StorageService } from '../storage/storage-service'
import { TabService } from '../tab/tab-service'
import { AsarUpdateService } from '../updater/asar-update-service'
import { UpdateService } from '../updater/update-service'
import { WebService } from '../web/web-service'
import { WindowService } from '../window/window-service'

/**
 * 平台组装根：初始化全部 Service → 注册 IPC → 建主窗口；
 * 退出时按依赖逆序释放资源（WebContents / Store / 监听器）。
 */
export class DesktopRuntime {
  private readonly events = new EventBus()
  private readonly resolver = new CallerResolver()
  private readonly registry = new AppRegistry()

  private logger!: Logger
  private sessionService!: SessionService
  private storageService!: StorageService
  private cacheService!: CacheService
  private permissionService!: PermissionService
  private downloadService!: DownloadService
  private updateService!: UpdateService
  private asarUpdateService!: AsarUpdateService
  private auditService!: AuditService
  private resilienceService!: ResilienceService
  private deviceService!: DeviceService
  /** features.tabs = false 时为空：单应用形态不装配 Tab 体系 */
  private appService?: AppService
  private webService?: WebService
  private tabService?: TabService
  private windowService!: WindowService

  constructor(private readonly options: BootstrapOptions) {}

  /** 装配 + Electron 生命周期接线 */
  start(): void {
    app.whenReady().then(() => {
      this.setup()

      electronApp.setAppUserModelId(this.options.app.id)

      // Default open or close DevTools by F12 in development
      // and ignore CommandOrControl + R in production.
      app.on('browser-window-created', (_, window) => {
        optimizer.watchWindowShortcuts(window)
      })

      this.windowService.createMainWindow(this.options)
      // 运行韧性（无人值守场景，默认全关）：主窗口就绪后挂载；
      // 定时重启的更新决策走闭包（调用时求值，规避服务创建顺序）
      this.resilienceService.attach(
        this.options,
        () => this.windowService.getMainWindow(),
        {
          hasPendingAsar: () => this.asarUpdateService.hasPending(),
          installPendingPackage: () => {
            if (!this.updateService.isDownloaded())
              return false
            this.updateService.install()
            return true
          },
        },
      )

      app.on('activate', () => {
        // On macOS re-create a window when the dock icon is clicked
        // and there are no other windows open.
        if (BrowserWindow.getAllWindows().length === 0)
          this.windowService.createMainWindow(this.options)
      })
    })

    // Quit when all windows are closed, except on macOS.
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin')
        app.quit()
    })

    app.on('will-quit', () => {
      this.dispose()
    })
  }

  /**
   * 组装序列（线性可读，各阶段职责单一）：
   * 日志 → 服务 → Tab 体系 → 更新 → App 注册 → IPC 与 Shell 桥 → 启动检查
   */
  private setup(): void {
    this.setupLogging()
    this.setupServices()
    this.setupTabServices()
    this.setupUpdaters()
    this.setupAppRegistry()
    this.setupIpcAndShellBridge()

    this.updateService.start()
    void this.asarUpdateService.start()
  }

  /** 日志根 + 系统级日志（未捕获异常 / 进程崩溃 / renderer 控制台桥接） */
  private setupLogging(): void {
    this.logger = createRootLogger({
      debug: is.dev,
      // 日志根作用域跟随启动的 App：com.company.kiosk → kiosk
      scope: this.options.app.id.split('.').pop() ?? 'desktop',
    })
    attachSystemLogging(this.logger, this.resolver, this.events)
    this.logger.info('desktop application starting', { appId: this.options.app.id })
  }

  /** 形态无关的基础服务：审计 / 会话 / 存储 / 权限 / 窗口 / 韧性 / 下载 */
  private setupServices(): void {
    // 审计日志：权限决策 / 崩溃 / App 生命周期的 append-only 留痕（与运行日志分离）
    this.auditService = new AuditService(this.events, this.logger.scope('audit'), app.getPath('userData'))
    this.auditService.start()

    this.sessionService = new SessionService()
    this.storageService = new StorageService()
    this.cacheService = new CacheService(this.sessionService, this.logger.scope('cache'))
    this.permissionService = new PermissionService(
      this.registry,
      this.events,
      this.logger.scope('permission'),
      // 运行时权限决策持久化：重启后不再重复询问（平台级存储）
      new Store<PermissionStoreSchema>({ name: 'platform-permissions' }),
    )
    this.windowService = new WindowService(
      this.events,
      this.resolver,
      this.logger.scope('window'),
    )
    this.resilienceService = new ResilienceService(this.events, this.logger.scope('resilience'))
    // 下载管理：App 首次取得 Session 时挂 will-download guard（按 manifest.download 权限放行）
    this.downloadService = new DownloadService(
      this.sessionService,
      this.permissionService,
      this.events,
      this.logger.scope('download'),
    )
    this.sessionService.onCreated((appId, appSession) => {
      this.downloadService.attach(appId, appSession)
    })

    // 设备通用层：device:* 通道（读卡器/打印机），Driver 缺省用内置 mock，可经 bootstrap.devices 注入
    this.deviceService = new DeviceService(this.options.devices ?? {}, this.logger.scope('device'))
    this.deviceService.register()
  }

  /** Tab 体系按形态装配：Kiosk 等单应用形态关掉后不初始化 Tab/App/Web 服务 */
  private setupTabServices(): void {
    const features = { tabs: true, ...this.options.features }
    if (!features.tabs) {
      this.logger.info('features.tabs disabled, tab services skipped')
      return
    }
    this.appService = new AppService(this.registry, this.options, this.events)
    this.webService = new WebService(
      this.windowService,
      this.sessionService,
      this.resolver,
      this.permissionService,
      this.logger.scope('web'),
    )
    this.tabService = new TabService(
      this.registry,
      this.appService,
      this.webService,
      this.events,
      this.logger.scope('tab'),
    )
  }

  /** 双通道更新：整包 electron-updater + asar 热更（引导器模式），未配置即各自关闭 */
  private setupUpdaters(): void {
    this.updateService = new UpdateService(
      this.options.updates?.url,
      this.events,
      this.logger.scope('update'),
    )
    this.asarUpdateService = new AsarUpdateService(
      this.options.updates?.asar,
      this.options.updates?.url,
      this.events,
      this.logger.scope('update'),
    )
  }

  /** 多源注册：代码注册内置 App（保底、优先），外部配置文件注册扩展 App */
  private setupAppRegistry(): void {
    // 冲突以代码注册为准（外部同名 App 跳过并告警），外部配置不能拖垮平台启动
    const registerApps = (manifests: DesktopAppManifest[], source: AppSource): void => {
      for (const manifest of manifests) {
        try {
          this.registry.register(manifest, source)
          this.events.emit('app:registered', manifest)
          this.logger.info(`app registered: ${manifest.id} (from ${source})`)
        }
        catch (error) {
          this.logger.warn(`app skipped: ${manifest.id}`, { source, error: String(error) })
        }
      }
    }
    registerApps(this.options.apps.manifests ?? [], 'code')
    registerApps(loadLocalAppManifests(app.getPath('userData'), this.logger), 'apps.json')
    // 远程源异步拉取：origin 白名单把关（默认空 = 禁用），失败不拖垮启动，注册成功后经事件正常流转
    if (this.options.apps.remoteUrl) {
      void loadRemoteAppManifests(
        this.options.apps.remoteUrl,
        this.logger,
        this.options.apps.remoteOrigins ?? [],
      ).then(manifests => registerApps(manifests, 'remote'))
    }
  }

  /** IPC 通道注册 + 平台事件 → Shell 推送桥 */
  private setupIpcAndShellBridge(): void {
    registerPlatformIpc({
      config: this.options,
      registry: this.registry,
      appService: this.appService,
      tabService: this.tabService,
      webService: this.webService,
      storageService: this.storageService,
      cacheService: this.cacheService,
      permissionService: this.permissionService,
      updateService: this.options.updates?.url ? this.updateService : undefined,
      asarService: this.options.updates?.asar ? this.asarUpdateService : undefined,
      resolver: this.resolver,
    })
    this.forwardEventsToShell()
  }

  /** 平台事件 → Shell 推送桥：Tab 列表全量推，UI 无需逐条 diff */
  private forwardEventsToShell(): void {
    const pushTabs = () => {
      this.windowService.getMainWindow()?.webContents.send('tabs:updated', this.tabService?.list() ?? [])
    }
    this.events.on('tab:created', pushTabs)
    this.events.on('tab:activated', pushTabs)
    this.events.on('tab:closed', (tab) => {
      pushTabs()
      // App 已关闭，挂起的运行时授权请求失去意义：按拒绝结束，Shell 侧同步移除授权条
      this.permissionService.cancelForApp(tab.appId)
    })
    this.events.on('window:maximizedChanged', (maximized) => {
      this.windowService.getMainWindow()?.webContents.send('window:maximizedChanged', maximized)
    })
    // 运行时权限请求 → Shell 授权条 UI，用户决策经 permission:respond 回传
    this.events.on('permission:request', (request) => {
      this.windowService.getMainWindow()?.webContents.send('permission:request', request)
    })
    // 下载任务状态 → Shell 底部横幅
    this.events.on('download:updated', (tasks) => {
      this.windowService.getMainWindow()?.webContents.send('download:updated', tasks)
    })
    // 更新流程状态 → Shell 底部横幅
    this.events.on('update:state', (state) => {
      this.windowService.getMainWindow()?.webContents.send('update:state', state)
    })
    // asar 热更状态 → Shell 更新横幅（pending = 重启应用生效）
    this.events.on('update:asarState', (state) => {
      this.windowService.getMainWindow()?.webContents.send('update:asarState', state)
    })
  }

  /** 逆序释放：WebContents → Store 句柄 → 事件监听 */
  private dispose(): void {
    this.webService?.dispose()
    this.storageService?.dispose()
    this.resilienceService?.dispose()
    this.auditService?.dispose()
    this.deviceService?.dispose()
    this.events.clear()
    this.logger?.info('desktop application disposed')
  }
}
