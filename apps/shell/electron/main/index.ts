import type { AppRootResolver, PermissionRule } from '@shell/app-runtime'
import type { DeviceGateway, DeviceTelemetry, DomainRouter, DriverResolver } from '@shell/devices'
import type { EventBus, PlatformKernel } from '@shell/kernel'
import type { Logger } from '@shell/kernel/logger'
import type { AppManifest, FlavorManifest } from '@shell/shared'
import type { PackageInstaller } from '@shell/update'
import { existsSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import process from 'node:process'
import {
  AppService,
  buildAppPermissionRules,
  buildPlatformPermissionRules,
  loadAppsJson,
  LocalOpener,
  PermissionService,
  registerAppProtocol,
  registerAppScheme,
  RemoteOpener,
} from '@shell/app-runtime'
import { createDeviceGateway, createDeviceTelemetry, createDomainRouter, createDriverResolver, detectDevicePlatform, resolvePlatformCapability } from '@shell/devices'
import { AppKvStore, createKernel, NotificationCenter, RetentionRegistry } from '@shell/kernel'
import { AuditLog } from '@shell/kernel/audit'
import { DownloadManager } from '@shell/kernel/download'
import { createRootLogger } from '@shell/kernel/logger'
import { AppSessionRegistry } from '@shell/kernel/session'
import { applySettingsSideEffects, settingsSnapshot } from '@shell/kernel/settings'
import { configDir, cookiesDir, filesDir, logsDir, platformDataRoot } from '@shell/kernel/storage'
import { assertSafeSegment, CallerRegistry, flavorManifestSchema, SHELL_APP_ID } from '@shell/shared'
import {
  AsarHotChannel,
  collectEffectiveAppVersions,
  DarwinInstaller,
  DistHotChannel,
  effectiveVersion,
  ForceUpdateGate,
  FullPackageChannel,
  hasPendingAsarUpdate,
  hotAppsDir,
  LinuxInstaller,
  markGracefulExit,
  readAppsPointer,
  UpdateCenter,
  Win32Installer,
} from '@shell/update'
import { OverlayService, ResilienceSystem, TraySystem, WindowSystem } from '@shell/window'
import { app, session } from 'electron'
import { registerShellIpc } from './shell-ipc'

/**
 * 组合根：全仓库唯一的组装现场。
 * 读本文件 = 读产品目录；除此之外任何模块不得创建跨系统对象。
 *
 * 打包态由 app.asar 引导层在 app ready 前加载并调用 boot(context)：
 * artifactRoot 指向真正被加载的 asar（内置包或 userData 热更包），
 * 所有产物路径从此显式注入，不再从 __dirname 推断。
 */
export interface BootContext {
  artifactRoot: string
  builtinRoot: string
  builtinVersion: string
  effectiveVersion: string
  resourcesVersion: string | null
  updaterDir: string
}

const logger = createRootLogger()

// 整包落地策略：平台差异收敛为数据表，组合根查表唯一创建并注入通道
const INSTALLERS: Record<string, new () => PackageInstaller> = {
  win32: Win32Installer,
  darwin: DarwinInstaller,
  linux: LinuxInstaller,
}
const InstallerCtor = INSTALLERS[process.platform]
if (!InstallerCtor) { logger.error('未支持的构建平台，整包更新通道不注册', { platform: process.platform }) }
const packageInstaller = InstallerCtor ? new InstallerCtor() : undefined

// 平台自身桥面权限：工作台代表平台，不与第三方应用共用声明式隔离
// media：验机拍摄走壳渲染层 getUserMedia（本机摄像头 UVC 路线），平台自身放行
const PLATFORM_SELF_PERMISSIONS: readonly PermissionRule[] = [
  'storage',
  'notification',
  'update',
  'tabs',
  'permissions',
  'media',
  'deviceConfig',
].map(permission => ({ app: SHELL_APP_ID, permission, verdict: 'allow' as const }))

// app:// 协议的特权声明必须在 app ready 前（Electron 时序硬约束）
registerAppScheme()

function loadFlavor() {
  // 打包：构建期把 flavor.json 注入 resources/（见 electron-builder.config.mjs extraResources）；
  // dev：--flavor=<id> 指向仓库 apps/flavors/<id>/flavor.json，缺省 solo-demo。
  const packaged = join(process.resourcesPath ?? '', 'flavor.json')
  if (existsSync(packaged)) {
    return flavorManifestSchema.parse(JSON.parse(readFileSync(packaged, 'utf-8')) as unknown)
  }
  const flavorArg = process.argv.find(a => a.startsWith('--flavor='))
  const flavorId = flavorArg?.split('=')[1] ?? 'solo-demo'
  assertSafeSegment(flavorId, 'flavorId')
  const flavorPath = join(app.getAppPath(), '../../apps/flavors', flavorId, 'flavor.json')
  const raw = JSON.parse(readFileSync(flavorPath, 'utf-8')) as unknown
  return flavorManifestSchema.parse(raw)
}

// 单实例锁：kiosk 自愈 relaunch 与重复启动都汇到唯一实例
let focusShell: (() => void) | undefined
if (!app.requestSingleInstanceLock()) {
  app.quit()
}
else {
  // 第二次启动：聚焦已有主窗（kiosk 全屏锁定同样适用），而不是静默无反应
  app.on('second-instance', () => focusShell?.())
}

/**
 * 按域分段的装配现场：buildAssembly 建基础件，setup* 按依赖顺序填充产出
 * （可空字段 = 对应 setup 的产出，装配顺序保证消费点非空）。
 */
interface Assembly {
  context: BootContext
  flavor: FlavorManifest
  logger: Logger
  /** 薄壳的 app.getVersion() 恒为出厂版本：生效版本一律读 current.json 指针 */
  version: () => string
  outDir: string
  rendererDir: string
  preloadDir: string
  mainDir: string
  builtinAppsRoot: string
  resolveAppRoot: AppRootResolver
  kernel: PlatformKernel
  windows: WindowSystem
  callers: CallerRegistry
  events: EventBus
  capability?: ReturnType<typeof resolvePlatformCapability>
  driver?: DriverResolver
  fullPackage?: FullPackageChannel
  updateCenter?: UpdateCenter
  forceGate?: ForceUpdateGate
  notifications?: NotificationCenter
  appKv?: AppKvStore
  overlays?: OverlayService
  resilience?: ResilienceSystem
  devices?: DeviceGateway
  telemetry?: DeviceTelemetry
  catalog?: AppManifest[]
  permissions?: PermissionService
  downloads?: DownloadManager
  appSessions?: AppSessionRegistry
  apps?: AppService
  router?: DomainRouter
  cancelCaptureDialog?: () => void
}

/** 基础件：路径 / 版本 / 主题主色 / 窗口系统 / 内核与身份账本 */
function buildAssembly(context: BootContext, flavor: FlavorManifest): Assembly {
  // 产物根由引导层注入：热更包位于 userData 时 __dirname 指向薄壳，那里没有 renderer/preload/device-host
  const outDir = join(context.artifactRoot, 'out')
  const version = () => effectiveVersion(context.builtinVersion)

  const theme = (settingsSnapshot().values.appearance?.theme as 'light' | 'dark' | 'system' | undefined) ?? 'system'
  // 主色：用户设置覆盖（appearance.accent，合法 Hex）优先，缺省跟随 flavor 品牌色
  const accentSetting = typeof settingsSnapshot().values.appearance?.accent === 'string'
    ? settingsSnapshot().values.appearance.accent as string
    : ''
  const accent = /^#[0-9a-f]{6}$/i.test(accentSetting) ? accentSetting : flavor.branding.accent
  const windows = new WindowSystem(flavor, join(outDir, 'renderer'), theme, accent)
  const kernel = createKernel(flavor, [windows])
  windows.bindEvents(kernel.ctx.events)

  // 内置应用 dist 根：asar 外的 extraResources 落点（<resources>/apps），只读基线。
  // dist-hot 产物落 userData，app:// 协议按 apps-current.json 指针取目录，读写同源。
  const builtinAppsRoot = app.isPackaged
    ? join(process.resourcesPath ?? '.', 'apps')
    : join(app.getAppPath(), 'resources/apps')
  const resolveAppRoot: AppRootResolver = (appId) => {
    const entry = readAppsPointer()[appId]
    if (entry?.dir && existsSync(entry.dir)) {
      return { root: hotAppsDir(), dir: basename(entry.dir) }
    }
    return { root: builtinAppsRoot, dir: appId }
  }

  return {
    context,
    flavor,
    logger,
    version,
    outDir,
    rendererDir: join(outDir, 'renderer'),
    preloadDir: join(outDir, 'preload'),
    mainDir: join(outDir, 'main'),
    builtinAppsRoot,
    resolveAppRoot,
    kernel,
    windows,
    callers: new CallerRegistry(),
    events: kernel.ctx.events,
  }
}

/** 更新链路：通道按 flavor.update 配置装配，整包落地策略由模块级 INSTALLERS 注入 */
function setupUpdate(a: Assembly): void {
  const updateManifestUrl = a.flavor.update.manifestUrl ?? ''
  if (!updateManifestUrl) { return }

  if (packageInstaller) {
    a.fullPackage = new FullPackageChannel({ manifestUrl: updateManifestUrl, allowedOrigins: a.flavor.update.allowedOrigins, installer: packageInstaller })
  }
  a.updateCenter = new UpdateCenter({
    channels: [
      new DistHotChannel({ manifestUrl: updateManifestUrl, allowedOrigins: a.flavor.update.allowedOrigins }),
      new AsarHotChannel({ manifestUrl: updateManifestUrl, allowedOrigins: a.flavor.update.allowedOrigins, resourcesVersion: a.context.resourcesVersion }),
      ...(a.fullPackage ? [a.fullPackage] : []),
    ],
    events: a.events,
    versionMatrix: async () => ({
      shell: a.version(),
      asar: a.version(),
      apps: collectEffectiveAppVersions(a.builtinAppsRoot, readAppsPointer()),
    }),
  })
  void a.kernel.register(a.updateCenter)

  // 强制更新门禁：清单 minVersion 低于生效版本即阻断，决策快照经 shell:info 下发
  a.forceGate = new ForceUpdateGate({
    manifestUrl: updateManifestUrl,
    allowedOrigins: a.flavor.update.allowedOrigins,
    currentVersion: a.version,
    events: a.events,
  })
  void a.kernel.register({
    name: 'force-gate',
    start: () => a.forceGate!.start(),
    stop: () => a.forceGate!.stop(),
  })
}

/** 平台自管服务：通知 / 应用 KV / 保留期 / 原生浮层 / 托盘 / 运行韧性，及跨系统事件接线 */
function setupPlatformSystems(a: Assembly): void {
  const notifications = new NotificationCenter({ events: a.events })
  a.notifications = notifications
  void a.kernel.register(notifications)
  a.appKv = new AppKvStore(join(configDir(), 'app-storage'))
  const DAY_MS = 24 * 60 * 60 * 1000
  const retention = new RetentionRegistry({ events: a.events })
  for (const domain of ['capture', 'print', 'signature']) {
    retention.register({ id: `product:${domain}`, dir: () => join(filesDir(), domain), maxAgeMs: 7 * DAY_MS })
  }
  retention.register({ id: 'audit-log', dir: () => join(logsDir(), 'audit'), maxAgeMs: 30 * DAY_MS })
  void a.kernel.register(retention)

  // WebContentsView 是原生合成层：弹窗、通知、菜单、更新提示统一走原生窗，避免被应用视图遮挡
  a.overlays = new OverlayService({
    windows: a.windows,
    events: a.events,
    notifications,
    onCaptureClose: () => a.cancelCaptureDialog?.(),
  })
  void a.kernel.register(a.overlays)

  a.events.on('update.restart-required', ({ version }) => a.overlays!.showUpdatePrompt(version))
  a.events.on('update.failed', ({ channel, reason }) => {
    notifications.push({ title: `更新失败（${channel}）`, body: reason, level: 'error' })
  })
  a.events.on('download.completed', ({ filename }) => {
    notifications.push({ title: '下载完成', body: filename, level: 'success' })
  })

  // 托盘（kiosk 全屏形态不创建——现场不该有逃逸入口）
  if (a.flavor.mode === 'windowed') {
    void a.kernel.register(new TraySystem(
      a.events,
      () => {
        const win = a.windows.shellWindow
        if (win) {
          if (win.isMinimized()) { win.restore() }
          win.show()
          win.focus()
        }
      },
    ))
  }

  // 运行韧性：flavor 声明才启用，全部默认关闭；attach 在主窗创建后调用
  a.resilience = new ResilienceSystem(a.events, a.logger)
  void a.kernel.register(a.resilience)
}

/** 设备域：能力探测 / 驱动寻址 / 网关与守护进程，观测统一发布进内核事件 */
function setupDevices(a: Assembly): void {
  // 平台能力一次探测，处处消费：能力表 → 驱动寻址策略 / 路由闸门 / 渲染层下发
  a.capability = resolvePlatformCapability(detectDevicePlatform().id, process.arch)
  // 声明格式是 devices/<域>/...，故资源根 = 包含 devices/ 的那个父目录。
  // dev/打包差异只在此处解析一次（唯一组装现场），域内部零感知。
  const bundledRoot = app.isPackaged
    ? (process.resourcesPath ?? app.getAppPath())
    : join(app.getAppPath(), '../../resources')
  a.driver = createDriverResolver(a.capability, {
    bundled: bundledRoot,
    manual: join(platformDataRoot(), 'resources'),
  })
  a.devices = createDeviceGateway({
    logger,
    events: a.events,
    hostEntryPath: join(a.mainDir, 'device-host.js'),
    driver: a.driver,
    paths: { storageRoot: configDir(), filesRoot: filesDir() },
    // 打印 URL 白名单独立于更新链路：flavor.print.urlOrigins（'*' 放行公网，内网仍被 SSRF 防线拦截）
    allowedOrigins: a.flavor.print.urlOrigins,
    platformId: a.capability.platform,
    availableDomains: a.capability.availableDomains,
    getParent: () => a.windows.shellWindow,
    captureOverlay: {
      pushCaptureSession: session => a.overlays!.pushCaptureDialog(session),
      getCaptureWindow: () => a.windows.getOverlay('capture') ?? null,
      dismissCaptureSession: () => a.overlays!.closeCapture(),
    },
  })
  a.telemetry = createDeviceTelemetry()

  a.cancelCaptureDialog = () => a.devices?.captureDialog?.cancelByOverlay()

  // 设备系统并入内核生命周期：start = 守护进程预热（打 t2 并广播 ready），stop = 全域 dispose
  void a.kernel.register({
    name: 'devices',
    start: () => a.devices!.warmup(() => {
      a.kernel.ctx.marks.t2DeviceHostReady = Date.now()
      a.events.emit('devices.ready', {})
    }),
    stop: async () => a.devices!.dispose(),
  })
}

/** 信任轴：apps.json 与 flavor 同为受信任部署输入，策略表与身份账本同源接线 */
function setupPermissions(a: Assembly): void {
  // 能写配置目录即可注册应用并声明权限，目录写权限须由部署侧管控；未声明的权限一律拒绝
  const externalApps = loadAppsJson(configDir(), a.logger, { excludeIds: a.flavor.apps.map(app => app.id) })
  a.catalog = [...a.flavor.apps, ...externalApps]

  a.permissions = new PermissionService({
    rules: [
      ...buildAppPermissionRules(a.catalog),
      ...buildPlatformPermissionRules(a.capability!.availableDomains),
      ...PLATFORM_SELF_PERMISSIONS,
    ],
    // 运行时授权结论落在平台 KV：同一 appId|permission 不再反复弹窗
    store: {
      get: async (key) => {
        const stored = a.appKv!.get(SHELL_APP_ID, `permission:${key}`)
        return stored === 'allow' || stored === 'deny' || stored === 'prompt' ? stored : undefined
      },
      set: async (key, verdict) => { a.appKv!.set(SHELL_APP_ID, `permission:${key}`, verdict) },
      delete: async (key) => { a.appKv!.remove(SHELL_APP_ID, `permission:${key}`) },
    },
    prompt: { ask: request => a.overlays!.requestPermission(request) },
    audit: (decision) => {
      a.events.emit('permission.decided', {
        appId: decision.request.appId,
        permission: decision.request.permission,
        verdict: decision.verdict,
        source: decision.source,
      })
    },
  })

  // 身份账本与系统权限闸门同源：窗口/视图创建时登记 webContents → appId，
  // 系统权限请求（摄像头/剪贴板等）按真实调用方查同一张策略表，页面无法伪造身份
  a.windows.bindCallerRegistry(
    a.callers,
    (appId, permission) => a.permissions!.decide({ appId, origin: `app://${appId}`, permission }),
  )
}

/** 应用运行时：下载门控 / 会话分区 / 审计 / AppService 与 openers 装配 */
function setupAppRuntime(a: Assembly): void {
  // 下载门控走同一张权限策略表：未声明 download 权限即拒绝。
  // 决策允许异步返回，期间下载照常进行；拒绝时取消并清理部分文件。
  a.downloads = new DownloadManager({
    events: a.events,
    logger,
    gate: ({ appId, url }) => {
      let origin = url
      try {
        origin = new URL(url).origin
      }
      catch {
        // blob:/data: 等非标准 URL，原值仅作审计线索
      }
      return a.permissions!.decide({ appId, origin, permission: 'download' })
        .then(allowed => (allowed ? 'allow' : 'deny'))
    },
    downloadsDir: app.getPath('downloads'),
  })

  // 每个应用一个会话分区：协议与下载门控在创建时由组合根接线，
  // 视图只声明 partition，窗口系统不认识应用会话策略。
  a.appSessions = new AppSessionRegistry({
    logger,
    events: a.events,
    cookiesDir: cookiesDir(),
    onSessionCreated: (ses, appId) => {
      registerAppProtocol(ses, a.resolveAppRoot)
      a.downloads!.attach(ses, appId)
    },
  })
  const auditLog = new AuditLog({ events: a.events, logger, dir: join(logsDir(), 'audit') })
  void a.kernel.register(auditLog)
  void a.kernel.register(a.appSessions)
  void a.kernel.register(a.downloads)

  // 应用运行时：openers 在此装配，AppService 只认 SPI
  a.apps = new AppService(
    manifest => a.permissions!.allowsApp(manifest),
    [
      new LocalOpener(a.windows, a.builtinAppsRoot, join(a.preloadDir, 'jsapi.cjs')),
      new RemoteOpener(a.windows, join(a.preloadDir, 'jsapi.cjs')),
    ],
    a.events,
  )
  for (const appManifest of a.flavor.apps) { a.apps.register(appManifest, 'flavor') }
  for (const appManifest of a.catalog!) { a.apps.register(appManifest, 'apps.json') }

  // 应用先建分区：窗口系统按 partition 取到的就是已注册协议与门控的 Session
  for (const manifest of a.catalog!) {
    a.appSessions.forApp(manifest.id)
  }
}

/** IPC 接线：窗口控制 / 事件广播 / 域路由 + 壳设施通道编排（通道实现在 shell-ipc.ts） */
function setupIpc(a: Assembly): void {
  a.windows.registerWindowControls()
  a.windows.attachEventBroadcast(a.events)

  // 域方法调用：身份从账本反查（页面无法伪造），授权与能力闸门在路由层统一判定
  a.router = createDomainRouter(a.devices!.domains, logger, {
    availableDomains: a.capability!.availableDomains,
    authorize: (grant, ctx) => a.permissions!.decide({
      appId: ctx.appId,
      origin: `app://${ctx.appId}`,
      permission: grant,
    }),
    telemetry: a.telemetry!,
    observation: {
      publish(observation) {
        if (observation.kind === 'call') {
          a.events.emit('devices.call-recorded', {
            capabilityId: observation.record.capabilityId,
            methodName: observation.record.methodName,
            appId: observation.record.appId,
            ok: observation.record.ok,
            durationMs: observation.record.durationMs,
            at: observation.record.startedAt,
            errorCode: observation.record.errorCode,
          })
        }
        else {
          a.events.emit('devices.telemetry-changed', observation.snapshot)
        }
      },
    },
  })

  // 壳设施通道注册集中在 shell-ipc 模块（组合根只装配，不做通道接线）：
  // 契约通道经 shellHandle/shellOn 注册（见 packages/shared/src/ipc/AGENTS.md），
  // 设备域与 JSAPI 单通道（domain-call / jsapi:call）在模块内保留各自错误语义。
  registerShellIpc({
    logger,
    kernel: a.kernel,
    callers: a.callers,
    router: a.router,
    apps: a.apps!,
    windows: a.windows,
    downloads: a.downloads!,
    appSessions: a.appSessions!,
    permissions: a.permissions!,
    appKv: a.appKv!,
    notifications: a.notifications!,
    updateCenter: a.updateCenter,
    forceGate: a.forceGate,
    capability: a.capability!,
    devices: a.devices!,
    telemetry: a.telemetry!,
    flavor: a.flavor,
    version: a.version,
    markGracefulExit,
  })
  // 应用 dist 分区协议：主 Session 注册（壳自身页面不经应用分区）
  registerAppProtocol(session.defaultSession, a.resolveAppRoot)
}

/** 主窗创建后的韧性接线与退出屏障 */
function setupResilienceAndExit(a: Assembly): void {
  // 韧性接线：更新择优依赖闭包注入——整包看通道实例状态，asar 看暂存标记
  a.resilience!.attach(a.flavor.resilience ?? {}, () => a.windows.shellWindow, {
    hasStagedPackage: () => a.fullPackage?.hasPendingInstall ?? false,
    hasPendingAsar: () => hasPendingAsarUpdate(),
  })

  // 退出屏障：引导层据此区分「新版本冷启动判活失败」与「同版本内主动重启」；
  // 整包安装器在应用退出后拉起，与设备守护进程的 kernel.stop() 同属一次退出流程
  app.on('before-quit', () => {
    markGracefulExit()
    a.fullPackage?.installOnQuit(err => logger.warn('整包安装器拉起失败', { error: String(err) }))
  })
}

async function main(context: BootContext): Promise<void> {
  // 持久化设置的启动副作用（开机自启可能被安装器重置，启动即纠正）
  applySettingsSideEffects()
  const flavor = loadFlavor()

  // 档位约束：solo/kiosk 容器隐形档必须有直达目标，否则窗口无内容可铺
  if (flavor.chrome === 'solo' && !flavor.defaultAppId && flavor.apps.length > 0) { logger.warn('flavor chrome=solo 但未配置 defaultAppId，启动将无应用直出', { flavor: flavor.id }) }

  const a = buildAssembly(context, flavor)
  setupUpdate(a)
  setupPlatformSystems(a)
  setupDevices(a)
  setupPermissions(a)
  setupAppRuntime(a)
  setupIpc(a)

  // 窗口先行：主窗在后台加载启动层，设备预热（守护进程 spawn + koffi 加载）
  // 与内核其余系统并行——暖机耗时不再表现为一段屏幕空窗
  a.windows.createShellWindow()
  focusShell = () => {
    const win = a.windows.shellWindow
    if (!win) { return }
    if (win.isMinimized()) { win.restore() }
    win.show()
    win.focus()
  }
  // 扫码枪键盘观察挂到工作台窗口
  a.devices!.attachShellWindow(a.windows.shellWindow!)
  a.kernel.ctx.marks.t3WindowShown = Date.now()

  await a.kernel.start()
  setupResilienceAndExit(a)
}

/** 引导层在 app ready 前 import 本模块后调用；dev 态无引导层时由下方自行构造上下文 */
export async function boot(context: BootContext): Promise<void> {
  await app.whenReady()
  await main(context)
}

if (!app.isPackaged) {
  const devRoot = app.getAppPath()
  void boot({
    artifactRoot: devRoot,
    builtinRoot: devRoot,
    builtinVersion: app.getVersion(),
    effectiveVersion: app.getVersion(),
    resourcesVersion: null,
    updaterDir: join(app.getPath('userData'), 'updater'),
  })
}
