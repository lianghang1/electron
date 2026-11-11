import type { EventBus } from '@shell/kernel'
import type { Logger } from '@shell/kernel/logger'
import type { DomainDefinition } from '@shell/shared'
import type { BrowserWindow } from 'electron'
import type { DomainDeps } from './domain-kit'
import type { CaptureSystem } from './domains/capture'
import type { CaptureOverlayHost } from './domains/capture/overlay-host'
import type { DriverResolver } from './drivers'
import { join } from 'node:path'
import { overridesStore } from './domain-kit'
import { createCaptureSystem } from './domains/capture'
import { CaptureDialogSessionService } from './domains/capture/dialog-session'
import { createCaptureDomain } from './domains/capture/domain'
import { createIcCardSystem } from './domains/iccard'
import { createIccardDomain } from './domains/iccard/domain'
import { createIdCardSystem } from './domains/idcard'
import { createIdcardDomain } from './domains/idcard/domain'
import { createPrintSystem } from './domains/print'
import { createPrintDomain } from './domains/print/domain'
import { SUMATRA_PDF_FILE } from './domains/print/sumatra'
import { createScannerSystem } from './domains/scanner'
import { createScannerDomain } from './domains/scanner/domain'
import { createSignatureSystem } from './domains/signature'
import { createSignatureDomain } from './domains/signature/domain'
import { DeviceHost } from './host/device-host'

export { createDomainRouter, DomainRouteError } from './domain-kit'
export type { DomainRouter } from './domain-kit'

/**
 * 设备网关：主进程侧的组装现场。
 * 六个域在一张装配表里声明「从统一上下文取什么参数、产出什么域定义」；
 * 本文件不再手工拼六种 options 形状，新增能力 = 加一行装配器。
 * 平台能力闸门在 createDomainRouter（组合根注入 availableDomains），驱动资产寻址
 * 由注入的 DriverResolver 决定——dev / 打包 / 现场部署三种根，域内部零感知。
 */

export interface DeviceGatewayPaths {
  /** 平台自管存储根（configDir()，档案覆盖持久化 / 打印任务簿） */
  storageRoot: string
  /** 业务产物根（filesDir()，打印归档 / 采集图片） */
  filesRoot: string
}

export interface DeviceGatewayOptions {
  logger: Logger
  events: EventBus
  /** 守护进程入口 js（out/main/device-host.js，与主进程 bundle 同目录） */
  hostEntryPath: string
  /** 驱动资产寻址策略：组合根查 PLATFORM_CAPABILITIES 装配并注入 */
  driver: DriverResolver
  paths: DeviceGatewayPaths
  /** 打印 URL 负载允许的源站（组合根注入）；空 = 拒绝远程下载，防 SSRF */
  allowedOrigins: readonly string[]
  /** 验机形态：放行诊断专用域方法，生产形态恒 false */
  diagnostics: boolean
  /** 主窗口引用：打印隐藏窗挂 parent，主窗销毁时级联销毁，避免进程常驻 */
  getParent?: () => BrowserWindow | undefined
  /** 拍摄浮层宿主：由组合根注入窗口系统实现，域内不认识 BrowserWindow 归属 */
  captureOverlay?: CaptureOverlayHost
}

export interface DeviceGateway {
  domains: DomainDefinition[]
  /** 拍摄浮层会话服务：注入宿主后才创建，组合根据此注册会话通道 */
  captureDialog?: CaptureDialogSessionService
  /** 预热守护进程（含 koffi 加载）；完成即打 t2DeviceHostReady */
  warmup: (onReady: () => void) => Promise<void>
  /** 工作台窗口就绪后调用：scanner 键盘观察挂到窗口（域方法不依赖窗口时序） */
  attachShellWindow: (win: BrowserWindow) => void
  dispose: () => void
}

/** 统一装配上下文：六个装配器面对同一份事实，各自只取所需字段。 */
interface AssemblyContext {
  logger: Logger
  events: EventBus
  host: DeviceHost
  /** 驱动资产根（declared devices/<域>/... 直接拼接即命中） */
  resourcesRoot: string
  sumatraPath: string
  storageRoot: string
  filesRoot: string
  allowedOrigins: readonly string[]
  diagnostics: boolean
  getParent?: () => BrowserWindow | undefined
  captureOverlay?: CaptureOverlayHost
}

interface AssembledDomain {
  readonly id: string
  readonly definition: DomainDefinition
  readonly dispose: () => void
  /** 需要接工作台窗口的域（scanner 键盘观察） */
  readonly attachWindow?: (win: BrowserWindow) => void
  /** 需要浮层会话的域（capture 拍摄对话框） */
  readonly capture?: CaptureSystem
}

type DomainAssembler = (ctx: AssemblyContext) => AssembledDomain

function domainDeps(ctx: AssemblyContext): DomainDeps {
  return { events: ctx.events, diagnostics: ctx.diagnostics }
}

/** 档案覆盖持久化：出厂默认 + 现场覆盖，读写共用一份存储。 */
function overrideStore(ctx: AssemblyContext, fileName: string) {
  return overridesStore(join(ctx.storageRoot, fileName))
}

/**
 * 装配表 = 六个能力域的唯一登记处。
 * 每项只负责「取参数 → 建系统 → 声明域定义与生命周期」，互不感知。
 */
const DOMAIN_ASSEMBLERS: readonly DomainAssembler[] = [
  (ctx) => {
    const system = createIdCardSystem({
      resourcesRoot: ctx.resourcesRoot,
      host: ctx.host,
      logger: ctx.logger.scope('devices:idcard'),
    })
    return { id: 'idcard', definition: createIdcardDomain(system), dispose: () => system.destroy() }
  },
  (ctx) => {
    const system = createIcCardSystem({
      resourcesRoot: ctx.resourcesRoot,
      host: ctx.host,
      logger: ctx.logger.scope('devices:iccard'),
    })
    return { id: 'iccard', definition: createIccardDomain(system), dispose: () => system.destroy() }
  },
  (ctx) => {
    const system = createPrintSystem({
      jobsFile: join(ctx.storageRoot, 'print-jobs.json'),
      archiveDir: join(ctx.filesRoot, 'print'),
      sumatraPath: ctx.sumatraPath,
      host: ctx.host,
      getParent: ctx.getParent,
      allowedOrigins: ctx.allowedOrigins,
      logger: ctx.logger.scope('devices:print'),
    })
    return { id: 'print', definition: createPrintDomain(system), dispose: () => system.destroy() }
  },
  (ctx) => {
    const store = overrideStore(ctx, 'scanner-overrides.json')
    const system = createScannerSystem({
      initialOverrides: store.read(),
      persist: overrides => store.write(overrides),
      logger: ctx.logger.scope('devices:scanner'),
    })
    return {
      id: 'scanner',
      definition: createScannerDomain(system, domainDeps(ctx)),
      dispose: () => system.destroy(),
      attachWindow: win => system.attachWindow(win),
    }
  },
  (ctx) => {
    const store = overrideStore(ctx, 'capture-overrides.json')
    const system = createCaptureSystem({
      resourcesRoot: ctx.resourcesRoot,
      host: ctx.host,
      initialOverrides: store.read(),
      persist: overrides => store.write(overrides),
      logger: ctx.logger.scope('devices:capture'),
      defaultSaveDir: join(ctx.filesRoot, 'capture'),
    })
    return {
      id: 'capture',
      definition: createCaptureDomain(system, domainDeps(ctx)),
      dispose: () => system.destroy(),
      capture: system,
    }
  },
  (ctx) => {
    const system = createSignatureSystem({
      resourcesRoot: ctx.resourcesRoot,
      host: ctx.host,
      logger: ctx.logger.scope('devices:signature'),
    })
    return { id: 'signature', definition: createSignatureDomain(system, domainDeps(ctx)), dispose: () => system.destroy() }
  },
]

export function createDeviceGateway(options: DeviceGatewayOptions): DeviceGateway {
  const log = options.logger.scope('devices')
  const host = new DeviceHost(options.logger, options.hostEntryPath)
  const ctx: AssemblyContext = {
    logger: options.logger,
    events: options.events,
    host,
    resourcesRoot: options.driver.assetRoot,
    sumatraPath: options.driver.resolve(SUMATRA_PDF_FILE),
    storageRoot: options.paths.storageRoot,
    filesRoot: options.paths.filesRoot,
    allowedOrigins: options.allowedOrigins,
    diagnostics: options.diagnostics,
    getParent: options.getParent,
    captureOverlay: options.captureOverlay,
  }

  // 查表装配：平台代码零分支，新增能力只需往 DOMAIN_ASSEMBLERS 加一行
  const assembled = DOMAIN_ASSEMBLERS.map(assemble => assemble(ctx))
  const domains = assembled.map(a => a.definition)
  const capture = assembled.find(a => a.id === 'capture')?.capture
  const captureDialog = options.captureOverlay && capture
    ? new CaptureDialogSessionService({ capture, overlay: options.captureOverlay })
    : undefined

  return {
    domains,
    captureDialog,

    warmup(onReady) {
      return host.warmup().then(() => { onReady() })
    },

    attachShellWindow(win) {
      for (const a of assembled) { a.attachWindow?.(win) }
    },

    dispose() {
      for (const a of assembled) { a.dispose() }
      host.dispose()
      log.info('device gateway disposed')
    },
  }
}
