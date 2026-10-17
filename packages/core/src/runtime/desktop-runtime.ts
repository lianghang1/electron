import type { AppSource, CaptureDeviceProfile, DesktopAppManifest, ScannerConfig } from '@desktop/shared'
import type { CaptureSystem } from '../devices/capture'
import type { IdCardSystem } from '../devices/idcard'
import type { PrintSystem } from '../devices/print'
import type { ScannerSystem } from '../devices/scanner'
import type { SignatureSystem } from '../devices/signature'
import type { Logger } from '../logger/logger'
import type { PermissionStoreSchema } from '../permission/permission-service'
import type { BootstrapOptions } from '../types'
import { dirname, isAbsolute, join } from 'node:path'
import process from 'node:process'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { app, BrowserWindow } from 'electron'
import { AppRegistry } from '../app/app-registry'
import { AppService } from '../app/app-service'
import { loadLocalAppManifests, loadRemoteAppManifests } from '../app/app-source'
import { AuditService } from '../audit/audit-service'
import { CacheService } from '../cache/cache-service'
import { createCaptureSystem } from '../devices/capture'
import { CaptureDialogSessionService } from '../devices/capture/dialog-session'
import { DeviceHost } from '../devices/host/device-host'
import { createIdCardSystem } from '../devices/idcard'
import { createPrintSystem } from '../devices/print'
import { createScannerSystem, SCANNER_DEFAULTS } from '../devices/scanner'
import { createSignatureSystem } from '../devices/signature'
import { DownloadService } from '../download/download-service'
import { EventBus } from '../event/event-bus'
import { registerPlatformIpc } from '../ipc'
import { CallerResolver } from '../ipc/caller-context'
import { attachHandleLogger, attachHandleResolver } from '../ipc/handle'
import { createRootLogger } from '../logger/logger'
import { attachSystemLogging } from '../logger/system'
import { PermissionService } from '../permission/permission-service'
import { ResilienceService } from '../resilience/resilience'
import { SessionService } from '../session/session-service'
import { StorageService } from '../storage/storage-service'
import { createStore } from '../storage/store'
import { TabService } from '../tab/tab-service'
import { AsarUpdateService } from '../updater/asar-update-service'
import { UpdateService } from '../updater/update-service'
import { WebService } from '../web/web-service'
import { OverlayWindowService } from '../window/overlay-window'
import { WindowService } from '../window/window-service'
import { resolveResourcePath } from './paths'

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
  /** features.tabs = false 时为空：单应用形态不装配 Tab 体系 */
  private appService?: AppService
  private webService?: WebService
  private tabService?: TabService
  private windowService!: WindowService
  /** 全局浮层独立原生窗：右键菜单/确认弹窗渲染处（原生层级压过 WebContentsView） */
  private overlayService!: OverlayWindowService
  /** 设备系统：证卡读取（dll 真实驱动） */
  private idCardSystem?: IdCardSystem
  /** 设备守护进程：厂商 DLL 的 koffi 调用全部在此进程执行（native 崩溃隔离 + 退避重启自愈） */
  private deviceHost?: DeviceHost
  /** 设备系统：扫码枪（键盘仿真观察，恒创建） */
  private scannerSystem!: ScannerSystem
  /** 设备系统：图像采集（UVC/DLL 双路线，恒创建） */
  private captureSystem!: CaptureSystem
  /** 拍摄浮层会话（内置 UI 浮层拍摄，恒创建） */
  private captureDialogService!: CaptureDialogSessionService
  /** 设备系统：统一打印（系统队列，恒创建） */
  private printSystem!: PrintSystem
  /** 设备系统：手写签名（dll 真实驱动） */
  private signatureSystem?: SignatureSystem

  constructor(private readonly options: BootstrapOptions) {}

  /** 装配 + Electron 生命周期接线 */
  start(): void {
    app.whenReady().then(() => {
      this.setup()

      electronApp.setAppUserModelId(this.options.app.id)

      // 快捷键收敛：dev 下 F12 开关 DevTools；生产屏蔽 CommandOrControl+R 刷新（防误触重载页面）
      app.on('browser-window-created', (_, window) => {
        optimizer.watchWindowShortcuts(window)
      })

      this.windowService.createMainWindow(this.options)
      // --app=<appId> 直启：主窗就绪后打开指定 App（套壳部署用）
      this.launchStartupApp()
      // 主窗就绪后预创建浮层窗：页面提前加载完成，首次弹出/授权弹窗即时呈现（免加载卡顿）
      this.overlayService.prewarm()
      // 运行韧性（无人值守场景，默认全关）：主窗口就绪后挂载；
      // 定时重启的更新决策走闭包（调用时求值，规避服务创建顺序）
      this.resilienceService.attach(
        this.options,
        () => this.windowService.getMainWindow(),
        {
          hasPendingAsar: () => this.asarUpdateService.hasPending(),
          installPendingPackage: () => {
            if (!this.updateService.isDownloaded()) { return false }
            this.updateService.install()
            return true
          },
        },
      )

      app.on('activate', () => {
        // macOS：点 Dock 图标时若无存活窗口则重建（其他平台窗口常驻，不触发）
        if (BrowserWindow.getAllWindows().length === 0) { this.windowService.createMainWindow(this.options) }
      })
    })

    // 全部窗口关闭即退出（macOS 惯例除外：关窗留驻 Dock，走 activate 重建）
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') { app.quit() }
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
    this.setupDevToolsHotkey()

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
    // 崩溃防护第 1 层：IPC handler 异常统一留痕（主进程排障盲区补齐）
    attachHandleLogger(this.logger.scope('ipc'))
    // 平台 IPC 域归属兜底：按调用者挂载清单放行（preload 收口之外的第二道）
    attachHandleResolver(this.resolver)
    this.logger.info('desktop application starting', {
      appId: this.options.app.id,
      // 崩溃防护第 0 层：crashDumps 本地落盘路径（bootstrap 已启动 CrashReporter，minidump 不上报）
      crashDumpsDir: app.getPath('crashDumps'),
    })
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
      createStore<PermissionStoreSchema>({ name: 'platform-permissions' }),
    )
    this.windowService = new WindowService(
      this.events,
      this.resolver,
      this.logger.scope('window'),
    )
    this.overlayService = new OverlayWindowService(
      () => this.windowService.getMainWindow(),
      this.resolver,
      this.logger.scope('overlay'),
    )
    this.resilienceService = new ResilienceService(this.events, this.logger.scope('resilience'))
    // 下载管理：App 首次取得 Session 时挂 will-download guard（按 manifest.download 权限放行）
    this.downloadService = new DownloadService(
      this.sessionService,
      this.permissionService,
      this.events,
      this.logger.scope('download'),
      this.resolver,
      this.options,
    )
    this.sessionService.onCreated((appId, appSession) => {
      this.downloadService.attach(appId, appSession)
      this.attachProtocolHandlers(appSession)
    })

    this.setupDevices()
  }

  /**
   * 设备系统装配：资源根统一经 resolveResourcePath 解析（缺省 resources/ —— dev 为
   * <应用根>/resources，打包为 <resourcesPath>/resources），DLL 与外置 exe 均相对它寻址
   * （idcard/capture/signature 的 devices/<brand>/、print 的 devices/print/）。
   * 运行时编辑持久化由 electron-store 托管（userData），capture 的存储缺键时回落出厂档案
   * （不设 defaults，避免空值覆盖）。
   */
  private setupDevices(): void {
    const resourcesRoot = this.options.devices?.resourcesRoot
      ? resolveResourcePath(this.options.devices.resourcesRoot)
      : resolveResourcePath('resources')

    // 设备守护进程：入口 bundle 与主进程同目录（out/main/device-host.js，electron-vite 多入口）
    this.deviceHost = new DeviceHost(this.logger.scope('device:host'), resolveHostEntryPath())
    // 预热：后台提前拉起守护进程（fork + koffi 加载），证卡/打印首次操作免等秒级冷启动
    void this.deviceHost.warmup()

    this.idCardSystem = createIdCardSystem({
      resourcesRoot,
      host: this.deviceHost,
      logger: this.logger.scope('device:idcard'),
    })

    this.signatureSystem = createSignatureSystem({
      resourcesRoot,
      logger: this.logger.scope('device:signature'),
    })

    // 扫码枪：配置持久化 + 键盘观察接入所有窗口（before-input-event，全局生效）
    const scannerStore = createStore<ScannerConfig>({ name: 'device-scanner', defaults: SCANNER_DEFAULTS })
    this.scannerSystem = createScannerSystem({
      initialConfig: scannerStore.store,
      persist: config => scannerStore.set(config),
      logger: this.logger.scope('device:scanner'),
    })
    app.on('browser-window-created', (_, win) => this.scannerSystem?.attachWindow(win))

    // 图像采集：设备档案持久化，图片默认落 userData/capture
    const captureStore = createStore<{ devices?: CaptureDeviceProfile[] }>({ name: 'device-capture-profiles' })
    this.captureSystem = createCaptureSystem({
      resourcesRoot,
      initialProfiles: captureStore.get('devices'),
      persist: devices => captureStore.set('devices', devices),
      defaultSaveDir: this.options.devices?.capture?.saveDir ?? join(app.getPath('userData'), 'capture'),
      logger: this.logger.scope('device:capture'),
    })
    // 拍摄浮层会话：overlayService 已在前置装配步骤创建
    this.captureDialogService = new CaptureDialogSessionService({
      capture: this.captureSystem,
      overlay: this.overlayService,
    })

    // 打印：SumatraPDF 相对资源根解析（缺省 devices/print/SumatraPDF.exe），绝对路径原样
    const sumatraRel = this.options.devices?.print?.sumatraPath ?? 'devices/print/SumatraPDF.exe'
    this.printSystem = createPrintSystem({
      stateDir: app.getPath('userData'),
      sumatraPath: isAbsolute(sumatraRel) ? sumatraRel : join(resourcesRoot, sumatraRel),
      // 打印隐藏窗挂主窗口为 parent：主窗关闭级联销毁池窗，退出链路才能走完
      getParent: () => this.windowService.getMainWindow(),
      // winspool 同步探测经设备守护进程执行，主进程事件循环零阻塞
      host: this.deviceHost,
      logger: this.logger.scope('device:print'),
    })
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
      overlayService: this.overlayService,
      downloadService: this.downloadService,
      idCard: this.idCardSystem,
      signature: this.signatureSystem,
      scanner: this.scannerSystem,
      capture: this.captureSystem,
      captureDialog: this.captureDialogService,
      print: this.printSystem,
      events: this.events,
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
    this.events.on('tab:updated', pushTabs)
    this.events.on('tab:activated', pushTabs)
    this.events.on('tab:closed', (tab) => {
      pushTabs()
      // App 已关闭，挂起的运行时授权请求失去意义：按拒绝结束，Shell 侧同步移除授权条
      this.permissionService.cancelForApp(tab.appId)
    })
    this.events.on('window:maximizedChanged', (maximized) => {
      this.windowService.getMainWindow()?.webContents.send('window:maximizedChanged', maximized)
    })
    // 运行时权限请求 → 浮层权限弹窗（原生窗压过 Web 容器），用户决策经 permission:respond 回传
    this.events.on('permission:request', (request) => {
      this.overlayService.pushDialog(request)
    })
    // 请求已结束（用户决策 / 30s 超时 / App 关闭作废）→ 弹窗卡片同步移除
    this.events.on('permission:decided', ({ requestId }) => {
      this.overlayService.resolveDialog(requestId)
    })
    // 平台通知 → 浮层窗右下角 toast（应用内可定制 UI，不进 OS 通知中心）
    this.events.on('notification:received', (notification) => {
      this.overlayService.pushToast(notification)
    })
    // 下载任务状态 → 浮层窗右下角下载面板
    this.events.on('download:updated', (tasks) => {
      this.overlayService.setDownloads(tasks)
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

  /**
   * --app=<appId> 直启：主窗就绪后打开指定 App。
   * 目标 App 尚未注册（远程源异步拉取）时挂 app:registered 事件兜底，注册即开。
   */
  private launchStartupApp(): void {
    const appId = process.argv.find(arg => arg.startsWith('--app='))?.slice('--app='.length)
    if (!appId) { return }
    if (!this.tabService) {
      this.logger.warn('--app launch skipped: tab services disabled')
      return
    }
    const open = (): boolean => {
      if (!this.registry.has(appId)) { return false }
      void this.tabService?.open({ appId }).catch((error) => {
        this.logger.warn(`startup app open failed: ${appId}`, { error: String(error) })
      })
      return true
    }
    if (open()) { return }
    const offRegistered = this.events.on('app:registered', (manifest) => {
      if (manifest.id === appId && open()) { offRegistered() }
    })
    this.logger.info('startup app pending registration', { appId })
  }

  /**
   * dev 态 DevTools 快捷键 F12 / Ctrl+Shift+I：对焦点所在的 webContents 切换 DevTools。
   * Tab 内容是独立 WebContentsView，optimizer 只给 BrowserWindow 挂快捷键够不到它；
   * 全局 before-input-event 焦点在哪个 webContents 就切换哪个（Tab 视图 / Shell / 浮层窗各开各的）。
   * 生产环境不注册，不给调试入口。
   */
  private setupDevToolsHotkey(): void {
    if (!is.dev) { return }
    app.on('web-contents-created', (_, webContents) => {
      webContents.on('before-input-event', (event, input) => {
        if (input.type !== 'keyDown') { return }
        const key = input.key.toLowerCase()
        const isF12 = key === 'f12'
        const isInspect = (input.control || input.meta) && input.shift && key === 'i'
        if (!isF12 && !isInspect) { return }
        event.preventDefault()
        if (webContents.isDevToolsOpened()) {
          webContents.closeDevTools()
        }
        else {
          webContents.openDevTools()
        }
      })
    })
  }

  /** 逆序释放：WebContents → Store 句柄 → 事件监听 */
  private dispose(): void {
    this.webService?.dispose()
    this.storageService?.dispose()
    this.idCardSystem?.destroy()
    this.signatureSystem?.destroy()
    this.scannerSystem?.destroy()
    this.captureSystem?.destroy()
    this.printSystem?.destroy()
    this.deviceHost?.dispose()
    this.resilienceService?.dispose()
    this.auditService?.dispose()
    this.events.clear()
    this.logger?.info('desktop application disposed')
  }

  /** bootstrap 注入的自定义协议处理器 → App Session（分区懒创建，幂等注册） */
  private readonly protocolHandled = new WeakSet<Electron.Session>()
  private attachProtocolHandlers(appSession: Electron.Session): void {
    if (this.protocolHandled.has(appSession)) { return }
    this.protocolHandled.add(appSession)
    for (const [scheme, handler] of Object.entries(this.options.protocols ?? {})) { appSession.protocol.handle(scheme, handler) }
  }
}

/**
 * 守护进程入口解析：宿主构建产物 out/main/device-host.cjs 与主进程 bundle 同目录
 * （共享 vite 工厂把 main 段固定输出为 CJS .cjs）。
 * CJS 产物取 __filename 基准；tsx 直跑源码联调无 __filename，退回 cwd 相对名（fork 失败即暴露）。
 */
function resolveHostEntryPath(): string {
  if (typeof __filename === 'string') {
    return join(dirname(__filename), 'device-host.cjs')
  }
  return 'device-host.cjs'
}
