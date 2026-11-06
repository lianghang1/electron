import type { DomainCallContext } from '@shell/shared'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { app, ipcMain } from 'electron'
import { DomainRouteError, createDeviceGateway, createDomainRouter } from '@shell/devices'
import { createKernel, type KernelSystem } from '@shell/kernel'
import { createRootLogger } from '@shell/kernel/logger'
import { AppService } from '@shell/app-runtime'
import { flavorManifestSchema } from '@shell/shared'
import { WindowSystem } from '@shell/window'
import { UpdateCenter } from '@shell/update'

/**
 * 组合根：全仓库唯一的组装现场（铁律一）。
 * 读本文件 = 读产品目录；除此之外任何模块不得创建跨系统对象。
 */

const logger = createRootLogger()

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
  const apps = new AppService(() => true)
  const devices = createDeviceGateway({
    logger,
    hostEntryPath: join(__dirname, 'device-host.js'),
    resourcesRoot: join(process.resourcesPath ?? app.getAppPath(), 'devices'),
  })

  const systems: KernelSystem[] = [apps, windows, new UpdateCenter([])]
  const kernel = createKernel(flavor, systems)

  // flavor 清单注册进应用运行时
  for (const appManifest of flavor.apps)
    apps.register(appManifest, 'flavor')

  // ── IPC 接线（都在组合根，铁律一）─────────────────────────────
  windows.registerWindowControls()
  windows.attachEventBroadcast(kernel.ctx.events)

  const router = createDomainRouter(devices.domains, logger)
  ipcMain.handle('domain-call', (event, method: string, input: unknown) => {
    const ctx: DomainCallContext = {
      appId: 'shell',
      instanceId: String(event.sender.id),
      log: message => logger.scope('domain').info(message, { method }),
    }
    return router.call(method, input, ctx).catch((err: unknown) => {
      // 错误契约：域错误原样抛（渲染层按 code 分支），路由层只补日志上下文
      const code = err instanceof DomainRouteError ? err.code : 'DOMAIN_ERROR'
      logger.warn('domain call failed', { method, code, err })
      throw err
    })
  })

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

  // 设备守护进程预热：冷启动成本移出首次设备操作，就绪即打 t2
  void devices.warmup(() => {
    kernel.ctx.marks.t2DeviceHostReady = Date.now()
  })

  windows.createShellWindow()
  kernel.ctx.marks.t3WindowShown = Date.now()
}

app.whenReady().then(() => main())
