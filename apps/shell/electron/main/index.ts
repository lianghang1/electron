import type { DomainCallContext } from '@shell/shared'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { app, ipcMain, session } from 'electron'
import {
  AppService,
  EmbeddedOpener,
  PackagedOpener,
  RemoteOpener,
  registerAppProtocol,
  registerAppScheme,
} from '@shell/app-runtime'
import { DomainRouteError, createDeviceGateway, createDomainRouter } from '@shell/devices'
import { createKernel } from '@shell/kernel'
import { createRootLogger } from '@shell/kernel/logger'
import { configDir, filesDir } from '@shell/kernel/storage'
import { flavorManifestSchema } from '@shell/shared'
import { WindowSystem } from '@shell/window'
import { UpdateCenter } from '@shell/update'
import { registerSettingsIpc } from '@shell/kernel/settings'

/**
 * 组合根：全仓库唯一的组装现场（铁律一）。
 * 读本文件 = 读产品目录；除此之外任何模块不得创建跨系统对象。
 */

const logger = createRootLogger()

// app:// 协议的特权声明必须在 app ready 前（Electron 时序硬约束）
registerAppScheme()

function loadFlavor() {
  // --flavor=<id> 指向 apps/flavors/<id>/flavor.json；缺省 cemetery。
  // dev：appPath=apps/shell，flavor 在仓库内；打包：flavor.json 由构建注入 resources（M6）。
  const flavorArg = process.argv.find(a => a.startsWith('--flavor='))
  const flavorId = flavorArg?.split('=')[1] ?? 'cemetery'
  const flavorPath = join(app.getAppPath(), '../../apps/flavors', flavorId, 'flavor.json')
  // JSON.parse 而非 require：main bundle 为 ESM，require 在打包产物里不可用
  const raw = JSON.parse(readFileSync(flavorPath, 'utf-8')) as unknown
  return flavorManifestSchema.parse(raw)
}

async function main(): Promise<void> {
  const flavor = loadFlavor()

  const windows = new WindowSystem(flavor, join(__dirname, '../renderer'))
  const kernel = createKernel(flavor, [windows, new UpdateCenter([])])
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
    stop: () => devices.dispose(),
  })

  // 应用运行时：openers 在此装配（铁律一），AppService 只认 SPI
  const appsRoot = join(app.getAppPath(), 'resources/apps')
  const apps = new AppService(
    () => true,
    [
      new EmbeddedOpener(),
      new PackagedOpener(windows, appsRoot),
      new RemoteOpener(windows, join(__dirname, '../preload/jsapi.js')),
    ],
    kernel.ctx.events,
  )
  for (const appManifest of flavor.apps)
    apps.register(appManifest, 'flavor')

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

  // 应用运行时通道
  ipcMain.handle('app:list', () => apps.list())
  ipcMain.handle('app:open', (_e, appId: string) => apps.open(appId))
  ipcMain.handle('app:close', (_e, instanceId: string) => apps.close(instanceId))
  ipcMain.handle('app:activate', (_e, instanceId: string) => windows.activate(instanceId))
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
}

void app.whenReady().then(() => main())
