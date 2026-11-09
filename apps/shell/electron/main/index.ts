import type { DomainCallContext } from '@shell/shared'
import type { PackageInstaller } from '@shell/update'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import {
  AppService,
  buildAppPermissionRules,
  buildPlatformPermissionRules,
  EmbeddedOpener,
  loadAppsJson,
  PackagedOpener,
  PermissionService,
  registerAppProtocol,
  registerAppScheme,
  RemoteOpener,
} from '@shell/app-runtime'
import { createDeviceGateway, createDomainRouter, createDriverResolver, detectDevicePlatform, DomainRouteError, resolvePlatformCapability } from '@shell/devices'
import { createKernel } from '@shell/kernel'
import { AuditLog } from '@shell/kernel/audit'
import { DownloadManager } from '@shell/kernel/download'
import { createRootLogger } from '@shell/kernel/logger'
import { AppSessionRegistry } from '@shell/kernel/session'
import { applySettingsSideEffects, registerSettingsIpc, settingsSnapshot } from '@shell/kernel/settings'
import { configDir, cookiesDir, filesDir, logsDir, migrateLegacyLayout, platformDataRoot } from '@shell/kernel/storage'
import { assertSafeSegment, CallerRegistry, flavorManifestSchema, matchesOrigin } from '@shell/shared'
import { AsarHotChannel, collectAppVersions, DarwinInstaller, DistHotChannel, finalizeAsarUpdate, ForceUpdateGate, FullPackageChannel, hasPendingAsarUpdate, LinuxInstaller, UpdateCenter, Win32Installer } from '@shell/update'
import { ResilienceSystem, TraySystem, WindowSystem } from '@shell/window'
import { app, ipcMain, session } from 'electron'

/**
 * 组合根：全仓库唯一的组装现场。
 * 读本文件 = 读产品目录；除此之外任何模块不得创建跨系统对象。
 */

// 旧布局一次性迁移必须先于任何写盘；失败仅告警不阻断启动
migrateLegacyLayout()

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

// asar 热更落盘切换（三段状态机 finalize）：必须早于任何模块加载 app.asar 内容；
// 切换失败只记录不抛出——Windows 文件锁下保留现场，下次启动重试
const asarFinalize = finalizeAsarUpdate(process.resourcesPath ?? '.')
if (!asarFinalize.ok) { logger.warn('asar 热更切换失败，下次启动重试', { error: asarFinalize.error }) }

// app:// 协议的特权声明必须在 app ready 前（Electron 时序硬约束）
registerAppScheme()

function loadFlavor() {
  // 打包：构建期把 flavor.json 注入 resources/（见 electron-builder.config.mjs extraResources）；
  // dev：--flavor=<id> 指向仓库 apps/flavors/<id>/flavor.json，缺省 cemetery。
  const packaged = join(process.resourcesPath ?? '', 'flavor.json')
  if (existsSync(packaged)) {
    return flavorManifestSchema.parse(JSON.parse(readFileSync(packaged, 'utf-8')) as unknown)
  }
  const flavorArg = process.argv.find(a => a.startsWith('--flavor='))
  const flavorId = flavorArg?.split('=')[1] ?? 'cemetery'
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

async function main(): Promise<void> {
  // 持久化设置的启动副作用（开机自启可能被安装器重置，启动即纠正）
  applySettingsSideEffects()
  const flavor = loadFlavor()

  // 档位约束：solo/kiosk 容器隐形档必须有直达目标，否则窗口无内容可铺
  if (flavor.chrome === 'solo' && !flavor.defaultAppId && flavor.apps.length > 0) { logger.warn('flavor chrome=solo 但未配置 defaultAppId，启动将无应用直出', { flavor: flavor.id }) }

  const theme = (settingsSnapshot().values.appearance?.theme as 'light' | 'dark' | 'system' | undefined) ?? 'system'
  const windows = new WindowSystem(flavor, join(__dirname, '../renderer'), theme)
  const callers = new CallerRegistry()
  const kernel = createKernel(flavor, [windows])

  // 应用 dist 根：打包态必须在 asar 外（extraResources 已把 resources/apps 复制到
  // <resources>/apps），asar 内不可写——dist-hot 通道的原子替换写的就是这个目录；
  // dev 态从仓库目录解析。app:// 协议读取与 dist-hot 写入必须同源（见 protocol.ts）
  const appsRoot = app.isPackaged
    ? join(process.resourcesPath ?? '.', 'apps')
    : join(app.getAppPath(), 'resources/apps')

  // 更新中心：通道按 flavor.update 配置装配，整包落地策略由组合根注入
  const updateManifestUrl = flavor.update.manifestUrl ?? ''
  let fullPackage: FullPackageChannel | undefined
  let updateCenter: UpdateCenter | undefined
  let forceGate: ForceUpdateGate | undefined
  if (updateManifestUrl) {
    if (packageInstaller) {
      fullPackage = new FullPackageChannel({ manifestUrl: updateManifestUrl, allowedOrigins: flavor.update.allowedOrigins, installer: packageInstaller })
    }
    updateCenter = new UpdateCenter({
      channels: [
        new DistHotChannel({ appsRoot, manifestUrl: updateManifestUrl, allowedOrigins: flavor.update.allowedOrigins }),
        new AsarHotChannel({ resourcesDir: process.resourcesPath ?? '.', manifestUrl: updateManifestUrl, allowedOrigins: flavor.update.allowedOrigins }),
        ...(fullPackage ? [fullPackage] : []),
      ],
      events: kernel.ctx.events,
      // 版本矩阵由组合根提供：app 版本读 appsRoot 下各应用 version.json（dist-hot 换目录后自动刷新），
      // asar 与 shell 同版本（asar 就是壳本身）
      versionMatrix: async () => ({
        shell: app.getVersion(),
        asar: app.getVersion(),
        apps: collectAppVersions(appsRoot),
      }),
    })
    void kernel.register(updateCenter)

    // 强制更新门禁：清单 minVersion 低于当前版本即阻断，决策快照经 shell:info 下发
    const gate = new ForceUpdateGate({
      manifestUrl: updateManifestUrl,
      allowedOrigins: flavor.update.allowedOrigins,
      currentVersion: () => app.getVersion(),
      events: kernel.ctx.events,
    })
    void kernel.register({
      name: 'force-gate',
      start: () => gate.start(),
      stop: () => gate.stop(),
    })
    forceGate = gate
  }
  windows.bindEvents(kernel.ctx.events)

  // 平台能力一次探测，处处消费：能力表 → 驱动寻址策略 / 路由闸门 / 渲染层下发
  const capability = resolvePlatformCapability(detectDevicePlatform().id, process.arch)
  // 声明格式是 devices/<域>/...，故资源根 = 包含 devices/ 的那个父目录。
  // dev/打包差异只在此处解析一次（唯一组装现场），域内部零感知。
  const bundledRoot = app.isPackaged
    ? (process.resourcesPath ?? app.getAppPath())
    : join(app.getAppPath(), '../../resources')
  const driver = createDriverResolver(capability, {
    bundled: bundledRoot,
    manual: join(platformDataRoot(), 'resources'),
  })
  const devices = createDeviceGateway({
    logger,
    events: kernel.ctx.events,
    hostEntryPath: join(__dirname, 'device-host.js'),
    driver,
    paths: { storageRoot: configDir(), filesRoot: filesDir() },
    allowedOrigins: flavor.update.allowedOrigins,
    diagnostics: flavor.diagnostics,
    getParent: () => windows.shellWindow,
  })

  // 设备系统并入内核生命周期：start = 守护进程预热（打 t2），stop = 全域 dispose
  void kernel.register({
    name: 'devices',
    start: () => devices.warmup(() => {
      kernel.ctx.marks.t2DeviceHostReady = Date.now()
    }),
    stop: async () => devices.dispose(),
  })

  // 托盘（kiosk 全屏形态不创建——现场不该有逃逸入口）
  if (flavor.mode === 'desktop') {
    void kernel.register(new TraySystem(
      kernel.ctx.events,
      () => {
        const win = windows.shellWindow
        if (win) {
          if (win.isMinimized()) { win.restore() }
          win.show()
          win.focus()
        }
      },
    ))
  }

  // 运行韧性：flavor 声明才启用，全部默认关闭；attach 在主窗创建后调用
  const resilience = new ResilienceSystem(kernel.ctx.events, logger)
  void kernel.register(resilience)

  // apps.json 与 flavor 同为受信任部署输入：能写配置目录即可注册应用并声明权限，
  // 目录写权限须由部署侧管控；未声明的权限一律拒绝
  const externalApps = loadAppsJson(configDir(), logger, { excludeIds: flavor.apps.map(a => a.id) })
  const catalog = [...flavor.apps, ...externalApps]
  const permissions = new PermissionService({
    rules: [
      ...buildAppPermissionRules(catalog),
      ...buildPlatformPermissionRules(capability.availableDomains),
    ],
    audit: (decision) => {
      kernel.ctx.events.emit('permission.decided', {
        appId: decision.request.appId,
        permission: decision.request.permission,
        verdict: decision.verdict,
        source: decision.source,
      })
    },
  })

  // 身份账本与系统权限闸门同源：窗口/视图创建时登记 webContents → appId，
  // 系统权限请求（摄像头/剪贴板等）按真实调用方查同一张策略表，页面无法伪造身份
  windows.bindCallerRegistry(
    callers,
    (appId, permission) => permissions.decide({ appId, origin: `app://${appId}`, permission }),
  )

  // 下载门控走同一张权限策略表：未声明 download 权限即拒绝。
  // 决策允许异步返回，期间下载照常进行；拒绝时取消并清理部分文件。
  const downloads = new DownloadManager({
    events: kernel.ctx.events,
    logger,
    gate: ({ appId, url }) => {
      let origin = url
      try {
        origin = new URL(url).origin
      }
      catch {
        // blob:/data: 等非标准 URL，原值仅作审计线索
      }
      return permissions.decide({ appId, origin, permission: 'download' })
        .then(allowed => (allowed ? 'allow' : 'deny'))
    },
    downloadsDir: app.getPath('downloads'),
  })

  // 每个应用一个会话分区：协议与下载门控在创建时由组合根接线，
  // 视图只声明 partition，窗口系统不认识应用会话策略。
  const appSessions = new AppSessionRegistry({
    logger,
    events: kernel.ctx.events,
    cookiesDir: cookiesDir(),
    onSessionCreated: (ses, appId) => {
      registerAppProtocol(ses, appsRoot)
      downloads.attach(ses, appId)
    },
  })
  const auditLog = new AuditLog({ events: kernel.ctx.events, logger, dir: join(logsDir(), 'audit') })
  void kernel.register(auditLog)
  void kernel.register(appSessions)
  void kernel.register(downloads)

  // 应用运行时：openers 在此装配，AppService 只认 SPI
  const apps = new AppService(
    manifest => permissions.allowsApp(manifest),
    [
      new EmbeddedOpener(),
      new PackagedOpener(windows, appsRoot),
      new RemoteOpener(windows, join(__dirname, '../preload/jsapi.cjs')),
    ],
    kernel.ctx.events,
  )
  for (const appManifest of flavor.apps) { apps.register(appManifest, 'flavor') }
  for (const appManifest of externalApps) { apps.register(appManifest, 'apps.json') }

  // 非 embedded 应用先建分区：窗口系统按 partition 取到的就是已注册协议与门控的 Session
  for (const manifest of catalog) {
    if (manifest.entry.kind !== 'embedded') { appSessions.forApp(manifest.id) }
  }

  function assertRegisteredApp(appId: string): void {
    if (!apps.list().some(r => r.manifest.id === appId)) { throw new Error(`应用未注册：${appId}`) }
  }

  // ── IPC 接线 ─────────────────────────────────────────────
  windows.registerWindowControls()
  windows.attachEventBroadcast(kernel.ctx.events)

  // 域方法调用：身份从账本反查（页面无法伪造），授权与能力闸门在路由层统一判定
  const router = createDomainRouter(devices.domains, logger, {
    availableDomains: capability.availableDomains,
    authorize: (grant, ctx) => permissions.decide({
      appId: ctx.appId,
      origin: `app://${ctx.appId}`,
      permission: grant,
    }),
  })
  ipcMain.handle('domain-call', (event, method: string, input: unknown) => {
    const caller = callers.tryResolve(event.sender.id)
    if (!caller) { throw new DomainRouteError('PERMISSION_DENIED', '调用方未登记') }
    const ctx: DomainCallContext = {
      appId: caller.appId,
      instanceId: caller.instanceId,
      log: message => logger.scope('domain').info(message, { method, appId: caller.appId }),
    }
    return router.call(method, input, ctx).catch((err: unknown) => {
      const code = err instanceof DomainRouteError ? err.code : 'DOMAIN_ERROR'
      logger.warn('domain call failed', { method, code, err })
      // 错误码编进 message：IPC 边界只可靠保留 Error.message，调试台据此展示结构化原因
      throw new Error(`[${code}] ${err instanceof Error ? err.message : String(err)}`)
    })
  })

  // 应用运行时通道（open 返回值是 IPC 边界投影：实例内部持有视图/窗口引用，
  // 不可结构化克隆——只出渲染层需要的纯数据）
  ipcMain.handle('app:list', () => apps.list())
  ipcMain.handle('app:open', async (_e, appId: string) => {
    const instance = await apps.open(appId)
    return {
      instanceId: instance.instanceId,
      appId: instance.appId,
      state: instance.state,
      handle: { route: instance.handle.route },
    }
  })
  ipcMain.handle('app:close', (_e, instanceId: string) => apps.close(instanceId))
  ipcMain.handle('app:activate', (_e, instanceId: string) => windows.activate(instanceId))

  // 下载任务与会话数据：只有壳渲染层持有完整桥面，应用视图拿不到这些通道
  ipcMain.handle('download:list', () => downloads.list())
  ipcMain.handle('download:cancel', (_e, taskId: string) => downloads.cancel(taskId))
  ipcMain.handle('download:open', (_e, taskId: string) => downloads.open(taskId))
  ipcMain.handle('download:reveal', (_e, taskId: string) => downloads.reveal(taskId))
  ipcMain.handle('download:dismiss', (_e, taskId: string) => downloads.dismiss(taskId))
  ipcMain.handle('session:clear-cache', async (_e, appId: string) => {
    assertRegisteredApp(appId)
    await appSessions.clearCache(appId)
    kernel.ctx.events.emit('session.cleared', { appId, scope: 'cache' })
  })
  ipcMain.handle('session:clear-site', async (_e, appId: string) => {
    assertRegisteredApp(appId)
    await appSessions.clearSiteData(appId)
    kernel.ctx.events.emit('session.cleared', { appId, scope: 'site-data' })
  })

  // 壳信息（渲染层按 chrome 档位决定挂不挂壳界面）
  ipcMain.handle('shell:info', () => ({
    name: flavor.name,
    version: app.getVersion(),
    defaultAppId: flavor.defaultAppId,
    chrome: flavor.mode === 'kiosk' ? 'solo' : flavor.chrome,
    mode: flavor.mode,
    // 门禁快照：渲染层启动即知是否阻断，后续变化经 update.force-required 事件推送
    forceUpdate: forceGate?.snapshot,
    // 能力矩阵下发：业务页按 availableDomains 决定功能可用性，无需自行判断平台
    capabilities: {
      platform: capability.platform,
      availableDomains: capability.availableDomains,
      driverDeployment: capability.driverDeployment,
      notes: capability.notes,
    },
  }))
  // 重启壳：quit 会触发 before-quit，把暂存的整包安装执行掉，再以新版本拉起
  ipcMain.handle('shell:relaunch', () => {
    app.relaunch()
    app.quit()
  })
  // 门禁页主动更新入口：巡检并应用；需重启时经 update.restart-required 事件回传
  ipcMain.handle('shell:update-now', () => updateCenter?.checkAndApply())
  ipcMain.on('view:content-rect', (_e, rect: { x: number, y: number, width: number, height: number }) =>
    windows.setContentRect(rect))

  // JSAPI 受控桥（remote 页面）：账本身份 + origin 白名单双重校验，
  // 域级放行交给路由层授权闸门，不在桥里另写一份 devices 判定
  ipcMain.handle('jsapi:call', (event, method: string, input: unknown) => {
    const caller = callers.tryResolve(event.sender.id)
    if (!caller) { throw new DomainRouteError('PERMISSION_DENIED', '调用方未登记') }
    const frameUrl = event.senderFrame?.url ?? ''
    let origin: string
    try {
      origin = new URL(frameUrl).origin
    }
    catch {
      throw new DomainRouteError('METHOD_NOT_FOUND', '无法解析调用方 origin')
    }
    const found = apps.list().find((r) => {
      const entry = r.manifest.entry
      return r.manifest.id === caller.appId
        && entry.kind === 'remote'
        && matchesOrigin(frameUrl, entry.origins)
    })
    if (!found) {
      logger.warn('jsapi rejected: origin not allowed', { origin, appId: caller.appId, method })
      throw new DomainRouteError('METHOD_NOT_FOUND', 'origin 未授权')
    }
    const ctx: DomainCallContext = {
      appId: caller.appId,
      instanceId: caller.instanceId,
      log: message => logger.scope('jsapi').info(message, { method, appId: caller.appId }),
    }
    return router.call(method, input, ctx).catch((err: unknown) => {
      logger.warn('jsapi call failed', { method, appId: caller.appId, err })
      throw err
    })
  })

  // 设置通道（schema 驱动）
  registerSettingsIpc(ipcMain)

  ipcMain.on('launch-mark:t4', () => {
    kernel.ctx.marks.t4FirstPaint = Date.now()
    const m = kernel.ctx.marks
    // 启动全链路打点汇总（一次启动一行，观测启动回归）
    logger.info('launch marks', {
      t0_process: m.t0ProcessStart,
      t1_kernel: m.t1KernelReady,
      t2_deviceHost: m.t2DeviceHostReady,
      t3_window: m.t3WindowShown,
      t4_firstPaint: m.t4FirstPaint,
    })
  })

  await kernel.start()

  // 应用 dist 分区协议：主 Session 注册（packaged 形态）
  registerAppProtocol(session.defaultSession, appsRoot)

  windows.createShellWindow()
  focusShell = () => {
    const win = windows.shellWindow
    if (!win) { return }
    if (win.isMinimized()) { win.restore() }
    win.show()
    win.focus()
  }
  // 扫码枪键盘观察挂到工作台窗口
  devices.attachShellWindow(windows.shellWindow!)
  kernel.ctx.marks.t3WindowShown = Date.now()

  // 韧性接线：更新择优依赖闭包注入——整包看通道实例状态，asar 看暂存标记
  resilience.attach(flavor.resilience ?? {}, () => windows.shellWindow, {
    hasStagedPackage: () => fullPackage?.hasPendingInstall ?? false,
    hasPendingAsar: () => hasPendingAsarUpdate(process.resourcesPath ?? '.'),
  })

  // 整包更新排程：退出前拉起安装器（状态在通道实例上，只拉起一次）
  app.on('before-quit', () => {
    fullPackage?.installOnQuit(err => logger.warn('整包安装器拉起失败', { error: String(err) }))
  })
}

void app.whenReady().then(() => main())
