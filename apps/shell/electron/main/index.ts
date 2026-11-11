import type { AppRootResolver, PermissionRule } from '@shell/app-runtime'
import type { CaptureDialogRequest, CaptureResult, DomainCallContext } from '@shell/shared'
import type { PackageInstaller } from '@shell/update'
import { existsSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
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
import { createDeviceGateway, createDeviceTelemetry, createDomainRouter, createDriverResolver, detectDevicePlatform, DomainRouteError, resolvePlatformCapability } from '@shell/devices'
import { AppKvStore, createKernel, NotificationCenter, RetentionRegistry } from '@shell/kernel'
import { AuditLog } from '@shell/kernel/audit'
import { DownloadManager } from '@shell/kernel/download'
import { createRootLogger } from '@shell/kernel/logger'
import { AppSessionRegistry } from '@shell/kernel/session'
import { applySettingsSideEffects, registerSettingsIpc, settingsSnapshot } from '@shell/kernel/settings'
import { configDir, cookiesDir, filesDir, logsDir, migrateLegacyLayout, platformDataRoot } from '@shell/kernel/storage'
import { assertSafeSegment, CallerRegistry, flavorManifestSchema, matchesOrigin, SHELL_APP_ID } from '@shell/shared'
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
import { app, ipcMain, session } from 'electron'

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

// 平台自身桥面权限：工作台代表平台，不与第三方应用共用声明式隔离
const PLATFORM_SELF_PERMISSIONS: readonly PermissionRule[] = [
  'storage',
  'notification',
  'update',
  'tabs',
  'permissions',
].map(permission => ({ app: SHELL_APP_ID, permission, verdict: 'allow' as const }))

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

async function main(context: BootContext): Promise<void> {
  // 持久化设置的启动副作用（开机自启可能被安装器重置，启动即纠正）
  applySettingsSideEffects()
  const flavor = loadFlavor()

  // 档位约束：solo/kiosk 容器隐形档必须有直达目标，否则窗口无内容可铺
  if (flavor.chrome === 'solo' && !flavor.defaultAppId && flavor.apps.length > 0) { logger.warn('flavor chrome=solo 但未配置 defaultAppId，启动将无应用直出', { flavor: flavor.id }) }

  // 产物根由引导层注入：热更包位于 userData 时 __dirname 指向薄壳，那里没有 renderer/preload/device-host
  const outDir = join(context.artifactRoot, 'out')
  const rendererDir = join(outDir, 'renderer')
  const preloadDir = join(outDir, 'preload')
  const mainDir = join(outDir, 'main')
  const builtinVersion = context.builtinVersion
  const version = () => effectiveVersion(builtinVersion)

  const theme = (settingsSnapshot().values.appearance?.theme as 'light' | 'dark' | 'system' | undefined) ?? 'system'
  const windows = new WindowSystem(flavor, rendererDir, theme)
  const callers = new CallerRegistry()
  const kernel = createKernel(flavor, [windows])

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
        new DistHotChannel({ manifestUrl: updateManifestUrl, allowedOrigins: flavor.update.allowedOrigins }),
        new AsarHotChannel({ manifestUrl: updateManifestUrl, allowedOrigins: flavor.update.allowedOrigins, resourcesVersion: context.resourcesVersion }),
        ...(fullPackage ? [fullPackage] : []),
      ],
      events: kernel.ctx.events,
      // 薄壳的 app.getVersion() 恒为出厂版本：生效版本一律读 current.json 指针
      versionMatrix: async () => ({
        shell: version(),
        asar: version(),
        apps: collectEffectiveAppVersions(builtinAppsRoot, readAppsPointer()),
      }),
    })
    void kernel.register(updateCenter)

    // 强制更新门禁：清单 minVersion 低于生效版本即阻断，决策快照经 shell:info 下发
    const gate = new ForceUpdateGate({
      manifestUrl: updateManifestUrl,
      allowedOrigins: flavor.update.allowedOrigins,
      currentVersion: version,
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
  // 统一消息通道、应用隔离 KV、过期产物清理、原生浮层宿主由内核统一持有生命周期
  const notifications = new NotificationCenter({ events: kernel.ctx.events })
  void kernel.register(notifications)
  const appKv = new AppKvStore(join(configDir(), 'app-storage'))
  const DAY_MS = 24 * 60 * 60 * 1000
  const retention = new RetentionRegistry({ events: kernel.ctx.events })
  for (const domain of ['capture', 'print', 'signature']) {
    retention.register({ id: `product:${domain}`, dir: () => join(filesDir(), domain), maxAgeMs: 7 * DAY_MS })
  }
  retention.register({ id: 'audit-log', dir: () => join(logsDir(), 'audit'), maxAgeMs: 30 * DAY_MS })
  void kernel.register(retention)

  // WebContentsView 是原生合成层：弹窗、通知、菜单、更新提示统一走原生窗，避免被应用视图遮挡
  let cancelCaptureDialog: (() => void) | undefined
  const overlays = new OverlayService({
    windows,
    events: kernel.ctx.events,
    notifications,
    onCaptureClose: () => cancelCaptureDialog?.(),
  })
  void kernel.register(overlays)

  kernel.ctx.events.on('update.restart-required', ({ version }) => overlays.showUpdatePrompt(version))
  kernel.ctx.events.on('update.failed', ({ channel, reason }) => {
    notifications.push({ title: `更新失败（${channel}）`, body: reason, level: 'error' })
  })
  kernel.ctx.events.on('download.completed', ({ filename }) => {
    notifications.push({ title: '下载完成', body: filename, level: 'success' })
  })

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
    hostEntryPath: join(mainDir, 'device-host.js'),
    driver,
    paths: { storageRoot: configDir(), filesRoot: filesDir() },
    allowedOrigins: flavor.update.allowedOrigins,
    diagnostics: flavor.diagnostics,
    platformId: capability.platform,
    availableDomains: capability.availableDomains,
    getParent: () => windows.shellWindow,
    captureOverlay: {
      pushCaptureSession: session => overlays.pushCaptureDialog(session),
      getCaptureWindow: () => windows.getOverlay('capture') ?? null,
      dismissCaptureSession: () => overlays.closeCapture(),
    },
  })

  cancelCaptureDialog = () => devices.captureDialog?.cancelByOverlay()

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
      ...PLATFORM_SELF_PERMISSIONS,
    ],
    // 运行时授权结论落在平台 KV：同一 appId|permission 不再反复弹窗
    store: {
      get: async (key) => {
        const stored = appKv.get(SHELL_APP_ID, `permission:${key}`)
        return stored === 'allow' || stored === 'deny' || stored === 'prompt' ? stored : undefined
      },
      set: async (key, verdict) => { appKv.set(SHELL_APP_ID, `permission:${key}`, verdict) },
      delete: async (key) => { appKv.remove(SHELL_APP_ID, `permission:${key}`) },
    },
    prompt: { ask: request => overlays.requestPermission(request) },
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
      registerAppProtocol(ses, resolveAppRoot)
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
      new PackagedOpener(windows, builtinAppsRoot),
      new RemoteOpener(windows, join(preloadDir, 'jsapi.cjs')),
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
  const telemetry = createDeviceTelemetry()
  const router = createDomainRouter(devices.domains, logger, {
    availableDomains: capability.availableDomains,
    authorize: (grant, ctx) => permissions.decide({
      appId: ctx.appId,
      origin: `app://${ctx.appId}`,
      permission: grant,
    }),
    telemetry,
    observation: {
      publish(observation) {
        if (observation.kind === 'call') {
          kernel.ctx.events.emit('devices.call-recorded', {
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
          kernel.ctx.events.emit('devices.telemetry-changed', observation.snapshot)
        }
      },
    },
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
    version: version(),
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
    deviceStatus: devices.deviceStatuses,
    deviceTelemetry: telemetry.snapshot(),
  }))
  // 重启壳：quit 会触发 before-quit，把暂存的整包安装执行掉，再以新版本拉起
  ipcMain.handle('shell:relaunch', () => {
    markGracefulExit()
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

  // 桥面通道统一从账本反查身份：页面不能伪造 appId
  const callerOf = (senderId: number) => {
    const caller = callers.tryResolve(senderId)
    if (!caller) { throw new Error('调用方未登记') }
    return caller
  }
  const authorized = async (senderId: number, permission: string): Promise<string> => {
    const caller = callerOf(senderId)
    const allowed = await permissions.decide({
      appId: caller.appId,
      origin: `app://${caller.appId}`,
      permission,
    })
    if (!allowed) { throw new Error(`PERMISSION_DENIED: ${permission}`) }
    return caller.appId
  }

  // App 隔离 KV：master ipc/storage.ts 的解析身份 + 校验 storage 权限，按 appId 分文件
  ipcMain.handle('storage:get', async (e, key: string) => appKv.get(await authorized(e.sender.id, 'storage'), key))
  ipcMain.handle('storage:set', async (e, key: string, value: unknown) => { appKv.set(await authorized(e.sender.id, 'storage'), key, value) })
  ipcMain.handle('storage:remove', async (e, key: string) => { appKv.remove(await authorized(e.sender.id, 'storage'), key) })
  ipcMain.handle('storage:clear', async (e) => { appKv.clear(await authorized(e.sender.id, 'storage')) })
  ipcMain.handle('storage:keys', async e => appKv.keys(await authorized(e.sender.id, 'storage')))
  ipcMain.handle('storage:snapshot', async e => appKv.snapshot(await authorized(e.sender.id, 'storage')))

  // 统一消息通道：toast / 通知中心 / 下载卡共用一份 TTL
  ipcMain.handle('notification:show', async (e, input: { title: string, body?: string, level?: string, ttlMs?: number }) => {
    await authorized(e.sender.id, 'notification')
    const level = input.level === 'success' || input.level === 'warning' || input.level === 'error' ? input.level : 'info'
    return notifications.push({ title: String(input.title), body: input.body, level, ttlMs: input.ttlMs })
  })
  ipcMain.handle('notification:dismiss', async (e, id: string) => {
    await authorized(e.sender.id, 'notification')
    notifications.dismiss(id)
  })
  ipcMain.handle('notification:list', async (e) => {
    await authorized(e.sender.id, 'notification')
    return notifications.list()
  })

  // 更新状态机：install 对齐 master ipc/update.ts——仅工作台可调用，pending 优先重启
  ipcMain.handle('update:state', () => updateCenter?.getState() ?? { status: 'idle' })
  ipcMain.handle('update:cancel', () => updateCenter?.cancel())
  ipcMain.handle('update:install', async (e) => {
    if (callerOf(e.sender.id).appId !== SHELL_APP_ID) { throw new Error('仅工作台可安装更新') }
    if (updateCenter?.hasPendingRestart()) {
      markGracefulExit()
      app.relaunch()
      app.quit()
      return
    }
    await updateCenter?.checkAndApply()
  })

  // 权限查询只做展示不弹窗；重置授权是工作台的管理动作
  ipcMain.handle('permission:query', (e, permission: string) => {
    const caller = callerOf(e.sender.id)
    return permissions.check({ appId: caller.appId, origin: `app://${caller.appId}`, permission })
  })
  ipcMain.handle('permission:list', (e, appId?: string) => permissions.listStates(appId ?? callerOf(e.sender.id).appId))
  ipcMain.handle('permission:reset', async (e, permission: string) => {
    if (callerOf(e.sender.id).appId !== SHELL_APP_ID) { throw new Error('仅工作台可重置授权') }
    await permissions.resetRuntime(permission)
  })

  // Tab 细粒度：重载指定实例；全屏进出由 WebContentsView 的 HTML5 fullscreen 事件接管
  ipcMain.handle('tabs:reload', (e, instanceId: string) => {
    callerOf(e.sender.id)
    windows.reload(instanceId)
  })

  // 运行时授权：应用主动请求 → 原生浮层询问 → 结论持久化
  ipcMain.handle('permission:request', (e, permission: string) => {
    const caller = callerOf(e.sender.id)
    return permissions.requestRuntime({ appId: caller.appId, origin: `app://${caller.appId}`, permission })
  })

  // 拍摄浮层会话（master ipc/capture.ts）：发起方身份从账本反查，浮层内操作按窗口归属校验
  const captureDialog = devices.captureDialog
  const pickString = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim() ? value.trim() : undefined
  const dialogRequest = (input: unknown): CaptureDialogRequest => {
    const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
    const resolutionNum = Number(raw.resolutionNum)
    const maxCount = Number(raw.maxCount)
    return {
      deviceId: pickString(raw.deviceId),
      deviceLabel: pickString(raw.deviceLabel),
      title: pickString(raw.title),
      resolutionNum: Number.isInteger(resolutionNum) && resolutionNum >= 0 ? resolutionNum : undefined,
      maxCount: Number.isInteger(maxCount) && maxCount >= 1 ? maxCount : undefined,
      format: raw.format === 'jpg' || raw.format === 'png' || raw.format === 'bmp' ? raw.format : undefined,
    }
  }
  const confirmResults = (input: unknown): CaptureResult[] => {
    if (!Array.isArray(input)) { return [] }
    return input.filter((item): item is CaptureResult => {
      const r = item as Partial<CaptureResult> | null
      return !!r && typeof r.imagePath === 'string' && r.imagePath.length > 0
    })
  }
  if (captureDialog) {
    ipcMain.handle('capture:open-dialog', (event, input: unknown) => {
      const caller = callerOf(event.sender.id)
      const appName = apps.list().find(r => r.manifest.id === caller.appId)?.manifest.name ?? caller.appId
      return captureDialog.open(dialogRequest(input), {
        wc: event.sender,
        tabId: caller.instanceId,
        appId: caller.appId,
        appName,
      })
    })
    ipcMain.handle('capture:close-dialog', (event) => {
      const caller = callerOf(event.sender.id)
      captureDialog.cancelByCaller({ appId: caller.appId, tabId: caller.instanceId })
    })
    ipcMain.handle('capture:dialog-preview-start', (event, input: { deviceId?: string, resolutionNum?: number }) =>
      captureDialog.startPreview(event.sender, String(input?.deviceId ?? ''), typeof input?.resolutionNum === 'number' ? { resolutionNum: input.resolutionNum } : undefined))
    ipcMain.handle('capture:dialog-preview-stop', event => captureDialog.stopPreview(event.sender))
    ipcMain.handle('capture:dialog-snap', (event, opts?: { dataUrl?: string, meta?: Record<string, unknown> }) =>
      captureDialog.capture(event.sender, opts))
    ipcMain.handle('capture:dialog-confirm', (event, results: unknown) =>
      captureDialog.confirm(event.sender, confirmResults(results)))
  }

  // 设备配置中心：六域参数读写与演示模式切换，均为平台管理动作。
  // 诊断台是验机形态的 embedded 应用（appId 非 shell），故按「平台自身 + 验机形态」放行，第三方应用一律拒绝。
  function assertDeviceConfigCaller(senderId: number): void {
    const appId = callerOf(senderId).appId
    if (appId !== SHELL_APP_ID && !flavor.diagnostics) {
      throw new Error('仅平台工作台可修改设备配置')
    }
  }
  ipcMain.handle('device:config:snapshot', (e, capabilityId?: string) => {
    assertDeviceConfigCaller(e.sender.id)
    return devices.configCenter.snapshot(capabilityId)
  })
  ipcMain.handle('device:config:apply', async (e, capabilityId: string, deviceProfileId: string, patch: Record<string, unknown>) => {
    assertDeviceConfigCaller(e.sender.id)
    await devices.applyConfig(capabilityId, deviceProfileId, patch ?? {})
    return devices.configCenter.snapshot(capabilityId)
  })
  ipcMain.handle('device:config:reset', async (e, capabilityId?: string) => {
    assertDeviceConfigCaller(e.sender.id)
    await devices.resetConfig(capabilityId)
    return devices.configCenter.snapshot()
  })
  ipcMain.handle('device:demo-mode', (e) => {
    assertDeviceConfigCaller(e.sender.id)
    return devices.isDemoMode()
  })
  ipcMain.handle('device:demo-mode:set', (e, enabled: boolean) => {
    assertDeviceConfigCaller(e.sender.id)
    devices.setDemoMode(Boolean(enabled))
    return devices.isDemoMode()
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
  registerAppProtocol(session.defaultSession, resolveAppRoot)

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
    hasPendingAsar: () => hasPendingAsarUpdate(),
  })

  // 退出屏障：引导层据此区分「新版本冷启动判活失败」与「同版本内主动重启」；
  // 整包安装器在应用退出后拉起，与设备守护进程的 kernel.stop() 同属一次退出流程
  app.on('before-quit', () => {
    markGracefulExit()
    fullPackage?.installOnQuit(err => logger.warn('整包安装器拉起失败', { error: String(err) }))
  })
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
    updaterDir: join(app.getPath('userData'), 'desktop-updater'),
  })
}
