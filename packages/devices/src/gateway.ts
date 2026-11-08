import type { EventBus } from '@shell/kernel'
import type { Logger } from '@shell/kernel/logger'
import type { DomainDefinition } from '@shell/shared'
import type { BrowserWindow } from 'electron'
import type { DomainDeps } from './domain-kit'
import type { CaptureSystem } from './domains/capture'
import type { IcCardSystem } from './domains/iccard'
import type { IdCardSystem } from './domains/idcard'
import type { PrintSystem } from './domains/print'
import type { ScannerSystem } from './domains/scanner'
import type { SignatureSystem } from './domains/signature'
import type { DriverResolver } from './drivers'
import { join } from 'node:path'
import { app } from 'electron'
import { overridesStore } from './domain-kit'
import { createCaptureSystem } from './domains/capture'
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
 * 设备网关：主进程侧的组装现场（铁律一）。
 * 六个域各自 defineDomain 自描述，本文件只做两件事：创建系统、按数据表收集域定义。
 * 平台能力闸门在 createDomainRouter（组合根注入 availableDomains），驱动资产寻址
 * 由注入的 DriverResolver 决定——dev / 打包 / 现场部署三种根，域内部零感知（铁律二）。
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
  /** 主窗口引用：打印隐藏窗挂 parent，主窗销毁时级联销毁，避免进程常驻 */
  getParent?: () => BrowserWindow | undefined
}

export interface DeviceGateway {
  domains: DomainDefinition[]
  /** 预热守护进程（含 koffi 加载）；完成即打 t2DeviceHostReady */
  warmup: (onReady: () => void) => Promise<void>
  /** 工作台窗口就绪后调用：scanner 键盘观察挂到窗口（域方法不依赖窗口时序） */
  attachShellWindow: (win: BrowserWindow) => void
  dispose: () => void
}

export function createDeviceGateway(options: DeviceGatewayOptions): DeviceGateway {
  const log = options.logger.scope('devices')
  const host = new DeviceHost(options.logger, options.hostEntryPath)
  // 资源根由策略给出：声明 devices/<域>/... 直接拼接即命中，无需域内部解析 dev/打包差异
  const resourcesRoot = options.driver.assetRoot
  const sumatraPath = options.driver.resolve(SUMATRA_PDF_FILE)

  const idcard: IdCardSystem = createIdCardSystem({
    resourcesRoot,
    host,
    logger: options.logger.scope('devices:idcard'),
  })
  const iccard: IcCardSystem = createIcCardSystem({
    resourcesRoot,
    host,
    logger: options.logger.scope('devices:iccard'),
  })
  const print: PrintSystem = createPrintSystem({
    jobsFile: join(options.paths.storageRoot, 'print-jobs.json'),
    archiveDir: join(options.paths.filesRoot, 'print'),
    sumatraPath,
    host,
    getParent: options.getParent,
    allowedOrigins: options.allowedOrigins,
    logger: options.logger.scope('devices:print'),
  })
  const scanner: ScannerSystem = createScannerSystem({
    initialOverrides: overridesStore(join(options.paths.storageRoot, 'scanner-overrides.json')).read(),
    persist: overrides => overridesStore(join(options.paths.storageRoot, 'scanner-overrides.json')).write(overrides),
    logger: options.logger.scope('devices:scanner'),
  })
  const capture: CaptureSystem = createCaptureSystem({
    resourcesRoot,
    host,
    initialOverrides: overridesStore(join(options.paths.storageRoot, 'capture-overrides.json')).read(),
    persist: overrides => overridesStore(join(options.paths.storageRoot, 'capture-overrides.json')).write(overrides),
    logger: options.logger.scope('devices:capture'),
    defaultSaveDir: join(options.paths.filesRoot, 'capture'),
  })
  const signature: SignatureSystem = createSignatureSystem({
    resourcesRoot,
    host,
    logger: options.logger.scope('devices:signature'),
  })

  const deps: DomainDeps = { events: options.events, isPackaged: app.isPackaged }

  // 域注册 = 数据表：新增域 = 加一行工厂，平台代码零分支（铁律二）
  const domains: DomainDefinition[] = [
    createIdcardDomain(idcard),
    createIccardDomain(iccard),
    createPrintDomain(print),
    createScannerDomain(scanner, deps),
    createCaptureDomain(capture, deps),
    createSignatureDomain(signature, deps),
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
