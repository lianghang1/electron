import type { EventBus } from '@shell/kernel'
import type { Logger } from '@shell/kernel/logger'
import type { DomainCallContext, DomainDefinition } from '@shell/shared'
import type { BrowserWindow } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import { z } from 'zod'
import { DeviceHost } from './host/device-host'
import { createCaptureSystem, type CaptureSystem } from './domains/capture'
import { createIcCardSystem, type IcCardSystem } from './domains/iccard'
import { createIdCardSystem, type IdCardSystem } from './domains/idcard'
import { createPrintSystem, type PrintSystem } from './domains/print'
import { createScannerSystem, type ScannerSystem } from './domains/scanner'
import { createSignatureSystem, type SignatureSystem } from './domains/signature'

/**
 * 设备网关：主进程侧的域方法装配与调用路由（铁律二）。
 * - 域接入 = 本文件一个适配块（zod 契约 + handler 映射），域内部系统零改动
 * - 渲染层经 bridge 的 'domain-call' 进来，router 按 "<域>.<方法>" 分发，
 *   输入经 zod 校验后才触达 handler（渲染层传参不可信）
 * - DLL 调用经 DeviceHost 进 utilityProcess，native 崩溃隔离 + 退避自愈
 * - 流式数据（预览帧/笔迹点）经 EventBus 广播；扫码由 ScanService 直推
 *   webContents（旧通道 'scanner:scanReceived'，bridge.onEvent 已做映射）
 *
 * 输出 schema 当前为 z.unknown() 透传：域内部系统类型已严格（TS 推导到渲染层
 * 客户端），运行时校验聚焦入参防线；逐方法收紧输出 schema 是增量活。
 */

export interface DeviceGatewayPaths {
  /** 平台自管存储根（configDir()，档案覆盖持久化 / 打印任务簿） */
  storageRoot: string
  /** 业务产物根（filesDir()，打印归档 / 采集图片） */
  filesRoot: string
  /** SumatraPDF 绝对路径（未就位时 PDF 直通回退 Chromium 窗口） */
  sumatraPath?: string
}

export interface DeviceGatewayOptions {
  logger: Logger
  events: EventBus
  /** 守护进程入口 js（out/main/device-host.js，与主进程 bundle 同目录） */
  hostEntryPath: string
  /** 厂商 SDK 资源根（DLL 等，dev / 打包差异由宿主解析） */
  resourcesRoot: string
  paths: DeviceGatewayPaths
}

export interface DeviceGateway {
  domains: DomainDefinition[]
  /** 预热守护进程（含 koffi 加载）；完成即打 t2DeviceHostReady */
  warmup(onReady: () => void): Promise<void>
  /** 工作台窗口就绪后调用：scanner 键盘观察挂到窗口（域方法不依赖窗口时序） */
  attachShellWindow(win: BrowserWindow): void
  dispose(): void
}

/** 域调用路由："<域>.<方法>" → zod 校验 + handler 分发（组合根把它接到 ipcMain） */
export interface DomainRouter {
  call(method: string, input: unknown, ctx: DomainCallContext): Promise<unknown>
}

export class DomainRouteError extends Error {
  constructor(
    readonly code: 'METHOD_NOT_FOUND' | 'INVALID_INPUT' | 'DEVICE_NOT_FOUND',
    message: string,
    readonly detail?: unknown,
  ) {
    super(message)
  }
}

export function createDomainRouter(domains: DomainDefinition[], logger: Logger): DomainRouter {
  const table = new Map<string, DomainDefinition['methods'][string]>()
  for (const domain of domains) {
    for (const [name, def] of Object.entries(domain.methods))
      table.set(`${domain.name}.${name}`, def)
  }

  return {
    async call(method, input, ctx) {
      const started = Date.now()
      const def = table.get(method)
      if (!def)
        throw new DomainRouteError('METHOD_NOT_FOUND', `未注册的域方法：${method}`)

      const parsed = def.input.safeParse(input)
      if (!parsed.success)
        throw new DomainRouteError('INVALID_INPUT', `入参校验失败：${method}`, parsed.error.flatten())

      try {
        return await def.handler(parsed.data as never, ctx)
      }
      finally {
        logger.debug('domain call', { method, ms: Date.now() - started })
      }
    },
  }
}

/** 单档案覆盖持久化（scanner/capture 域共用形状，各自独立文件） */
function overridesStore(file: string) {
  return {
    read: <T>(): T | undefined => {
      try {
        return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf-8')) as T) : undefined
      }
      catch {
        return undefined
      }
    },
    write: (value: unknown): void => {
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, JSON.stringify(value, null, 2))
    },
  }
}

export function createDeviceGateway(options: DeviceGatewayOptions): DeviceGateway {
  const log = options.logger.scope('devices')
  const host = new DeviceHost(options.logger, options.hostEntryPath)

  const idcard: IdCardSystem = createIdCardSystem({
    resourcesRoot: options.resourcesRoot,
    host,
    logger: options.logger.scope('devices:idcard'),
  })

  const iccard: IcCardSystem = createIcCardSystem({
    resourcesRoot: options.resourcesRoot,
    host,
    logger: options.logger.scope('devices:iccard'),
  })

  const print: PrintSystem = createPrintSystem({
    jobsFile: join(options.paths.storageRoot, 'print-jobs.json'),
    archiveDir: join(options.paths.filesRoot, 'print'),
    sumatraPath: options.paths.sumatraPath,
    host,
    logger: options.logger.scope('devices:print'),
  })

  const scanner: ScannerSystem = createScannerSystem({
    initialOverrides: overridesStore(join(options.paths.storageRoot, 'scanner-overrides.json')).read(),
    persist: overrides => overridesStore(join(options.paths.storageRoot, 'scanner-overrides.json')).write(overrides),
    logger: options.logger.scope('devices:scanner'),
  })

  const capture: CaptureSystem = createCaptureSystem({
    resourcesRoot: options.resourcesRoot,
    host,
    initialOverrides: overridesStore(join(options.paths.storageRoot, 'capture-overrides.json')).read(),
    persist: overrides => overridesStore(join(options.paths.storageRoot, 'capture-overrides.json')).write(overrides),
    logger: options.logger.scope('devices:capture'),
    defaultSaveDir: join(options.paths.filesRoot, 'capture'),
  })

  const signature: SignatureSystem = createSignatureSystem({
    resourcesRoot: options.resourcesRoot,
    host,
    logger: options.logger.scope('devices:signature'),
  })

  /** IC 卡/读卡器定位：deviceId 缺省 = 第一个就绪设备（沿用旧域通道语义） */
  async function pickReady(devices: { id: string, status: string }[], kind: string): Promise<string> {
    const found = devices.find(d => d.status === 'ready')?.id
    if (!found)
      throw new DomainRouteError('DEVICE_NOT_FOUND', `无可用${kind}`)
    return found
  }

  const domains: DomainDefinition[] = [
    // ── idcard：身份证阅读 ──────────────────────────────────────
    defineDomain('idcard', {
      listReaders: {
        input: z.undefined().optional(),
        output: z.unknown(),
        handler: () => idcard.listReaders(),
      },
      read: {
        input: z.object({ deviceId: z.string().optional() }),
        output: z.unknown(),
        handler: async (input) => {
          const deviceId = input.deviceId
            ?? await pickReady(await idcard.listReaders(), '身份证阅读器')
          return idcard.read({ deviceId })
        },
      },
      getConfig: {
        input: z.undefined().optional(),
        output: z.unknown(),
        handler: () => idcard.getConfig(),
      },
      setConfig: {
        input: z.object({ id: z.string(), overrides: z.record(z.string(), z.unknown()) }),
        output: z.unknown(),
        handler: ({ id, overrides }) => idcard.setConfig(id, overrides as never),
      },
    }),

    // ── iccard：M1 IC 卡读写 ───────────────────────────────────
    defineDomain('iccard', {
      listReaders: {
        input: z.undefined().optional(),
        output: z.unknown(),
        handler: () => iccard.listReaders(),
      },
      readIc: {
        input: z.object({ deviceId: z.string().optional() }).passthrough(),
        output: z.unknown(),
        handler: async (input) => {
          const deviceId = input.deviceId
            ?? await pickReady(await iccard.listReaders(), 'IC 卡读写器')
          return iccard.readIc({ ...input, deviceId })
        },
      },
      writeIc: {
        input: z.object({ deviceId: z.string().optional() }).passthrough(),
        output: z.unknown(),
        handler: async (input) => {
          const deviceId = input.deviceId
            ?? await pickReady(await iccard.listReaders(), 'IC 卡读写器')
          return iccard.writeIc({ ...input, deviceId })
        },
      },
      writeIcTexts: {
        input: z.object({ deviceId: z.string().optional() }).passthrough(),
        output: z.unknown(),
        handler: async (input) => {
          const deviceId = input.deviceId
            ?? await pickReady(await iccard.listReaders(), 'IC 卡读写器')
          return iccard.writeIcTexts({ ...input, deviceId })
        },
      },
      getConfig: {
        input: z.undefined().optional(),
        output: z.unknown(),
        handler: () => iccard.getConfig(),
      },
      setConfig: {
        input: z.object({ id: z.string(), overrides: z.record(z.string(), z.unknown()) }),
        output: z.unknown(),
        handler: ({ id, overrides }) => iccard.setConfig(id, overrides as never),
      },
    }),

    // ── print：统一打印（任务簿 + 归档 + 重打）──────────────────
    defineDomain('print', {
      submit: {
        input: z.object({}).passthrough(),
        output: z.unknown(),
        handler: input => print.submit(input as never),
      },
      listPrinters: {
        input: z.undefined().optional(),
        output: z.unknown(),
        handler: () => print.listPrinters(),
      },
      status: {
        input: z.object({ jobId: z.string() }),
        output: z.unknown(),
        handler: ({ jobId }) => print.status(jobId),
      },
      listJobs: {
        input: z.object({ limit: z.number().int().positive().optional() }).optional(),
        output: z.unknown(),
        handler: input => print.listJobs(input?.limit),
      },
      removeJob: {
        input: z.object({ jobId: z.string() }),
        output: z.boolean(),
        handler: ({ jobId }) => print.removeJob(jobId),
      },
      clearJobs: {
        input: z.undefined().optional(),
        output: z.number(),
        handler: () => print.clearJobs(),
      },
      reprint: {
        input: z.object({ jobId: z.string() }),
        output: z.unknown(),
        handler: ({ jobId }) => print.reprint(jobId),
      },
    }),

    // ── scanner：扫码枪（扫码内容由 ScanService 直推 webContents）─
    defineDomain('scanner', {
      getConfig: {
        input: z.undefined().optional(),
        output: z.unknown(),
        handler: () => scanner.getConfig(),
      },
      setConfig: {
        input: z.object({ deviceId: z.string().min(1), overrides: z.record(z.string(), z.unknown()).optional() }).passthrough(),
        output: z.unknown(),
        handler: input => scanner.setConfig(input as never),
      },
      simulate: {
        // 诊断工具不进生产 API 面（与旧域通道同策略）
        input: z.object({ code: z.string().min(1) }),
        output: z.unknown(),
        handler: ({ code }) => {
          if (app.isPackaged)
            throw new DomainRouteError('INVALID_INPUT', 'scanner.simulate 仅限开发环境')
          return scanner.simulate(code)
        },
      },
    }),

    // ── capture：高拍仪 / 摄像采集（预览帧经事件广播）───────────
    defineDomain('capture', {
      listDevices: {
        input: z.undefined().optional(),
        output: z.unknown(),
        handler: () => capture.listDevices(),
      },
      getConfigs: {
        input: z.undefined().optional(),
        output: z.unknown(),
        handler: () => capture.getConfigs(),
      },
      setConfig: {
        input: z.object({ id: z.string(), overrides: z.record(z.string(), z.unknown()) }),
        output: z.unknown(),
        handler: ({ id, overrides }) => capture.setConfig(id, overrides as never),
      },
      getDefaultDevice: {
        input: z.undefined().optional(),
        output: z.unknown(),
        handler: () => capture.getDefaultDevice(),
      },
      setDefaultDevice: {
        input: z.object({ id: z.string().nullable() }),
        output: z.unknown(),
        handler: ({ id }) => capture.setDefaultDevice(id),
      },
      resolveDefaultDevice: {
        input: z.undefined().optional(),
        output: z.unknown(),
        handler: () => capture.resolveDefaultDevice(),
      },
      capture: {
        input: z.object({}).passthrough(),
        output: z.unknown(),
        handler: input => capture.capture(input as never),
      },
      saveDataUrl: {
        input: z.object({ dataUrl: z.string(), ext: z.string().optional() }),
        output: z.unknown(),
        handler: ({ dataUrl, ext }) => capture.saveDataUrl(dataUrl, ext),
      },
      startPreview: {
        input: z.object({ deviceId: z.string().optional() }).passthrough(),
        output: z.unknown(),
        handler: async (input) => {
          const resolved = input.deviceId
            ?? (await capture.resolveDefaultDevice() as { id?: string } | undefined)?.id
          if (!resolved)
            throw new DomainRouteError('DEVICE_NOT_FOUND', '无可用采集设备')
          // 预览帧经 EventBus 广播（高频数据不进 invoke 通道）
          return capture.startPreview(resolved, frame =>
            options.events.emit('capture.frame', { deviceId: resolved, frame }))
        },
      },
      stopPreview: {
        input: z.object({ deviceId: z.string() }),
        output: z.unknown(),
        handler: ({ deviceId }) => capture.stopPreview(deviceId),
      },
      listCameras: {
        input: z.object({ deviceId: z.string().optional() }),
        output: z.unknown(),
        handler: async ({ deviceId }) => {
          const resolved = deviceId
            ?? (await capture.resolveDefaultDevice() as { id?: string } | undefined)?.id
          if (!resolved)
            throw new DomainRouteError('DEVICE_NOT_FOUND', '无可用采集设备')
          return capture.listCameras(resolved)
        },
      },
    }),

    // ── signature：手写签名板（笔迹点经事件广播）────────────────
    defineDomain('signature', {
      listDevices: {
        input: z.undefined().optional(),
        output: z.unknown(),
        handler: () => signature.listDevices(),
      },
      start: {
        input: z.object({ deviceId: z.string().optional() }).optional(),
        output: z.unknown(),
        handler: input => signature.start(input, point =>
          options.events.emit('signature.stroke', { point })),
      },
      stop: {
        input: z.undefined().optional(),
        output: z.unknown(),
        handler: () => signature.stop(),
      },
      clear: {
        input: z.undefined().optional(),
        output: z.unknown(),
        handler: () => signature.clear(),
      },
      cancel: {
        input: z.undefined().optional(),
        output: z.unknown(),
        handler: () => signature.cancel(),
      },
      getConfig: {
        input: z.undefined().optional(),
        output: z.unknown(),
        handler: () => signature.getConfig(),
      },
      setConfig: {
        input: z.object({ id: z.string(), overrides: z.record(z.string(), z.unknown()) }),
        output: z.unknown(),
        handler: ({ id, overrides }) => signature.setConfig(id, overrides as never),
      },
    }),
  ]

  return {
    domains,

    warmup(onReady) {
      return host.warmup().then(() => {
        onReady()
      })
    },

    attachShellWindow(win) {
      scanner.attachWindow(win)
    },

    dispose() {
      idcard.destroy()
      iccard.destroy()
      print.destroy()
      scanner.destroy()
      capture.destroy()
      signature.destroy()
      host.dispose()
      log.info('device gateway disposed')
    },
  }
}
