import type { DomainCallContext } from '@shell/shared'
import type { PackageInstaller } from '@shell/update'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import {
  AppService,
  EmbeddedOpener,
  PackagedOpener,
  registerAppProtocol,
  registerAppScheme,
  RemoteOpener,
} from '@shell/app-runtime'
import { createDeviceGateway, createDomainRouter, DomainRouteError } from '@shell/devices'
import { createKernel } from '@shell/kernel'
import { createRootLogger } from '@shell/kernel/logger'
import { applySettingsSideEffects, registerSettingsIpc, settingsSnapshot } from '@shell/kernel/settings'
import { configDir, filesDir } from '@shell/kernel/storage'
import { flavorManifestSchema } from '@shell/shared'
import { AsarHotChannel, collectAppVersions, DarwinInstaller, DistHotChannel, finalizeAsarUpdate, FullPackageChannel, LinuxInstaller, UpdateCenter, Win32Installer } from '@shell/update'
import { TraySystem, WindowSystem } from '@shell/window'
import { app, ipcMain, session } from 'electron'

/**
 * 组合根：全仓库唯一的组装现场（铁律一）。
 * 读本文件 = 读产品目录；除此之外任何模块不得创建跨系统对象。
 */

const logger = createRootLogger()

// 整包落地策略：平台差异收敛为数据表，组合根查表唯一创建并注入通道（铁律一/二）
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
  const flavorPath = join(app.getAppPath(), '../../apps/flavors', flavorId, 'flavor.json')
  const raw = JSON.parse(readFileSync(flavorPath, 'utf-8')) as unknown
  return flavorManifestSchema.parse(raw)
}

// 单实例锁：kiosk 自愈 relaunch 与重复启动都汇到唯一实例
if (!app.requestSingleInstanceLock()) { app.quit() }

async function main(): Promise<void> {
  // 持久化设置的启动副作用（开机自启可能被安装器重置，启动即纠正）
  applySettingsSideEffects()
  const flavor = loadFlavor()

  // 档位约束：solo/kiosk 容器隐形档必须有直达目标，否则窗口无内容可铺
  if (flavor.chrome === 'solo' && !flavor.defaultAppId && flavor.apps.length > 0) { logger.warn('flavor chrome=solo 但未配置 defaultAppId，启动将无应用直出', { flavor: flavor.id }) }

  const theme = (settingsSnapshot().values.appearance?.theme as 'light' | 'dark' | 'system' | undefined) ?? 'system'
  const windows = new WindowSystem(flavor, join(__dirname, '../renderer'), theme)
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
  if (updateManifestUrl) {
    if (packageInstaller) {
      fullPackage = new FullPackageChannel({ manifestUrl: updateManifestUrl, allowedOrigins: flavor.update.allowedOrigins, installer: packageInstaller })
    }
    void kernel.register(new UpdateCenter({
      channels: [
        new DistHotChannel({ appsRoot, manifestUrl: updateManifestUrl, allowedOrigins: flavor.update.allowedOrigins }),
        new AsarHotChannel({ resourcesDir: process.resourcesPath ?? '.', manifestUrl: updateManifestUrl, allowedOrigins: flavor.update.allowedOrigins }),
        ...(fullPackage ? [fullPackage] : []),
      ],
      events: kernel.ctx.events,
      deviceId: `${flavor.id}-${process.platform}`,
      // 版本矩阵由组合根提供：app 版本读 appsRoot 下各应用 version.json（dist-hot 换目录后自动刷新），
      // asar 与 shell 同版本（asar 就是壳本身）
      versionMatrix: async () => ({
        shell: app.getVersion(),
        asar: app.getVersion(),
        apps: collectAppVersions(appsRoot),
      }),
    }))
  }
  windows.bindEvents(kernel.ctx.events)

  const devices = createDeviceGateway({
    logger,
    events: kernel.ctx.events,
    hostEntryPath: join(__dirname, 'device-host.js'),
    resourcesRoot: join(process.resourcesPath ?? app.getAppPath(), 'devices'),
    paths: { storageRoot: configDir(), filesRoot: filesDir() },
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

  // 应用运行时：openers 在此装配（铁律一），AppService 只认 SPI
  const apps = new AppService(
    () => true,
    [
      new EmbeddedOpener(),
      new PackagedOpener(windows, appsRoot),
      new RemoteOpener(windows, join(__dirname, '../preload/jsapi.cjs')),
    ],
    kernel.ctx.events,
  )
  for (const appManifest of flavor.apps) { apps.register(appManifest, 'flavor') }

  // ── IPC 接线（都在组合根，铁律一）─────────────────────────────
  windows.registerWindowControls()
  windows.attachEventBroadcast(kernel.ctx.events)

  // 域方法调用（shell 渲染层，全量能力）
  const router = createDomainRouter(devices.domains, logger)
  ipcMain.handle('domain-call', (event, method: string, input: unknown) => {
    const ctx: DomainCallContext = {
      appId: 'shell',
      instanceId: String(event.sender.id),
      log: message => logger.scope('domain').info(message, { method }),
    }
    return router.call(method, input, ctx).catch((err: unknown) => {
      const code = err instanceof DomainRouteError ? err.code : 'DOMAIN_ERROR'
      logger.warn('domain call failed', { method, code, err })
      throw err
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

  // 壳信息（渲染层按 chrome 档位决定挂不挂壳界面）
  ipcMain.handle('shell:info', () => ({
    name: flavor.name,
    version: app.getVersion(),
    defaultAppId: flavor.defaultAppId,
    chrome: flavor.mode === 'kiosk' ? 'solo' : flavor.chrome,
    mode: flavor.mode,
  }))
  ipcMain.on('view:content-rect', (_e, rect: { x: number, y: number, width: number, height: number }) =>
    windows.setContentRect(rect))

  // JSAPI 受控桥（remote 页面）：origin 白名单 + manifest.devices 声明双重过滤
  ipcMain.handle('jsapi:call', (event, method: string, input: unknown) => {
    const frameUrl = event.senderFrame?.url ?? ''
    const origin = new URL(frameUrl).origin
    const found = apps.list().find((r) => {
      const entry = r.manifest.entry
      return entry.kind === 'remote' && (entry as { origins: string[] }).origins.includes(origin)
    })
    if (!found) {
      logger.warn('jsapi rejected: origin not allowed', { origin, method })
      throw new DomainRouteError('METHOD_NOT_FOUND', 'origin 未授权')
    }
    const domain = method.split('.')[0] ?? ''
    if (!found.manifest.devices.includes(domain)) {
      logger.warn('jsapi rejected: domain not declared', { appId: found.manifest.id, method })
      throw new DomainRouteError('METHOD_NOT_FOUND', `未声明的设备能力：${domain}`)
    }
    const ctx: DomainCallContext = {
      appId: found.manifest.id,
      instanceId: origin,
      log: message => logger.scope('jsapi').info(message, { method, appId: found.manifest.id }),
    }
    return router.call(method, input, ctx).catch((err: unknown) => {
      logger.warn('jsapi call failed', { method, appId: found.manifest.id, err })
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
  // 扫码枪键盘观察挂到工作台窗口
  devices.attachShellWindow(windows.shellWindow!)
  kernel.ctx.marks.t3WindowShown = Date.now()

  // 整包更新排程：退出前拉起安装器（状态在通道实例上，只拉起一次）
  app.on('before-quit', () => {
    fullPackage?.installOnQuit(err => logger.warn('整包安装器拉起失败', { error: String(err) }))
  })
}

void app.whenReady().then(() => main())
