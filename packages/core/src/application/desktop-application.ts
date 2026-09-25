import type { Logger } from '../logger/logger'
import type { BootstrapOptions } from '../types'
import process from 'node:process'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { app, BrowserWindow } from 'electron'
import { AppRegistry } from '../app/app-registry'
import { AppService } from '../app/app-service'
import { EventBus } from '../event/event-bus'
import { CallerResolver } from '../ipc/caller-context'
import { registerPlatformIpc } from '../ipc/register'
import { createRootLogger } from '../logger/logger'
import { attachSystemLogging } from '../logger/system'
import { PermissionService } from '../permission/permission-service'
import { SessionService } from '../session/session-service'
import { StorageService } from '../storage/storage-service'
import { TabService } from '../tab/tab-service'
import { WebService } from '../web/web-service'
import { WindowService } from '../window/window-service'

/**
 * 平台组装根：初始化全部 Service → 注册 IPC → 建主窗口；
 * 退出时按依赖逆序释放资源（WebContents / Store / 监听器）。
 */
export class DesktopApplication {
  private readonly events = new EventBus()
  private readonly resolver = new CallerResolver()
  private readonly registry = new AppRegistry()

  private logger!: Logger
  private sessionService!: SessionService
  private storageService!: StorageService
  private permissionService!: PermissionService
  private appService!: AppService
  private webService!: WebService
  private tabService!: TabService
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

  private setup(): void {
    this.logger = createRootLogger({
      debug: is.dev,
      // 日志根作用域跟随启动的 App：com.company.kiosk → kiosk
      scope: this.options.app.id.split('.').pop() ?? 'desktop',
    })
    // 系统级日志：未捕获异常 / 子进程与渲染进程崩溃 / renderer 控制台
    attachSystemLogging(this.logger, this.resolver)
    this.logger.info('desktop application starting', { appId: this.options.app.id })

    this.sessionService = new SessionService()
    this.storageService = new StorageService()
    this.permissionService = new PermissionService(
      this.registry,
      this.events,
      this.logger.scope('permission'),
    )
    this.appService = new AppService(this.registry, this.options, this.events)
    this.windowService = new WindowService(
      this.events,
      this.resolver,
      this.logger.scope('window'),
    )
    this.webService = new WebService(
      this.windowService,
      this.sessionService,
      this.resolver,
      this.logger.scope('web'),
    )
    this.tabService = new TabService(
      this.registry,
      this.appService,
      this.webService,
      this.events,
      this.logger.scope('tab'),
    )

    // 第一阶段代码注册内置 App（未来扩展为远程配置 / 应用中心）
    for (const manifest of this.options.apps.manifests ?? []) {
      this.registry.register(manifest)
      this.events.emit('app:registered', manifest)
      this.logger.info(`app registered: ${manifest.id}`)
    }

    registerPlatformIpc({
      config: this.options,
      registry: this.registry,
      appService: this.appService,
      tabService: this.tabService,
      webService: this.webService,
      storageService: this.storageService,
      permissionService: this.permissionService,
      resolver: this.resolver,
    })

    this.forwardEventsToShell()
  }

  /** 平台事件 → Shell 推送桥：Tab 列表全量推，UI 无需逐条 diff */
  private forwardEventsToShell(): void {
    const pushTabs = () => {
      this.windowService.getMainWindow()?.webContents.send('tabs:updated', this.tabService.list())
    }
    this.events.on('tab:created', pushTabs)
    this.events.on('tab:activated', pushTabs)
    this.events.on('tab:closed', pushTabs)
    this.events.on('window:maximizedChanged', (maximized) => {
      this.windowService.getMainWindow()?.webContents.send('window:maximizedChanged', maximized)
    })
  }

  /** 逆序释放：WebContents → Store 句柄 → 事件监听 */
  private dispose(): void {
    this.webService?.dispose()
    this.storageService?.dispose()
    this.events.clear()
    this.logger?.info('desktop application disposed')
  }
}
