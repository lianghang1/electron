import type { EventBus } from '@shell/kernel'
import type { Logger } from '@shell/kernel/logger'
import type { DeviceCapabilityId, DomainCallContext, DomainDefinition } from '@shell/shared'
import type { BrowserWindow } from 'electron'
import type { DeviceCapabilitySpec, DeviceConfigCenter, StoredConfigDocument } from './config-center'
import type { DemoModeState, DomainDeps } from './domain-kit'
import type { CaptureSystem } from './domains/capture'
import type { CaptureOverlayHost } from './domains/capture/overlay-host'
import type { DriverResolver } from './drivers'
import type { ChannelDescriptor } from './runtime/channel'
import type { DeviceStatus } from './runtime/device-state'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { DEVICE_CAPABILITIES, DEVICE_CAPABILITY_IDS } from '@shell/shared'
import { createDeviceConfigCenter } from './config-center'
import { overridesStore } from './domain-kit'
import { createCaptureSystem } from './domains/capture'
import { CAPTURE_CHANNELS } from './domains/capture/channels/registry'
import { BUILT_IN_CAPTURE_CONFIGS } from './domains/capture/configs'
import { CaptureDialogSessionService } from './domains/capture/dialog-session'
import { createCaptureDomain } from './domains/capture/domain'
import { createIcCardSystem } from './domains/iccard'
import { ICCARD_CHANNELS } from './domains/iccard/channels/registry'
import { BUILT_IN_ICCARD_CONFIGS } from './domains/iccard/configs'
import { createIccardDomain } from './domains/iccard/domain'
import { createIdCardSystem } from './domains/idcard'
import { IDCARD_CHANNELS } from './domains/idcard/channels/registry'
import { BUILT_IN_IDCARD_CONFIGS } from './domains/idcard/configs'
import { createIdcardDomain } from './domains/idcard/domain'
import { createPrintSystem } from './domains/print'
import { PRINT_CHANNELS } from './domains/print/channels/registry'
import { createPrintDomain } from './domains/print/domain'
import { selectSumatraPdfFile } from './domains/print/sumatra'
import { createScannerSystem } from './domains/scanner'
import { SCANNER_CHANNELS } from './domains/scanner/channels/registry'
import { createScannerDomain } from './domains/scanner/domain'
import { SCANNER_DEFAULTS } from './domains/scanner/service'
import { createSignatureSystem } from './domains/signature'
import { SIGNATURE_CHANNELS } from './domains/signature/channels/registry'
import { BUILT_IN_SIGNATURE_CONFIGS } from './domains/signature/configs'
import { createSignatureDomain } from './domains/signature/domain'
import { DeviceHost } from './host/device-host'
import { createChannelRegistry } from './runtime/channel'
import { buildDeviceStatuses } from './runtime/device-status'
import { CAPABILITY_DESCRIPTORS, registerStandardCatalog } from './runtime/platform-profiles'
import { createDeviceRegistry } from './runtime/registry'

export { createDomainRouter, DomainRouteError } from './domain-kit'
export type { DomainRouter } from './domain-kit'

/**
 * 设备网关：主进程侧的组装现场。
 * 能力目录 DOMAIN_SPECS 是唯一登记处：每项声明装配器、配置档案、setConfig 形状、
 * 通道声明与缺省同步钩子；新增能力域只需在能力身份表加一项并补齐目录，
 * 类型约束会拦住漏登记的域。平台能力闸门在 createDomainRouter，驱动资产寻址
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
  /** 打印 URL 负载允许的源站（组合根注入 flavor.print.urlOrigins）；空 = 拒绝远程下载，防 SSRF */
  allowedOrigins: readonly string[]
  paths: DeviceGatewayPaths
  /** 验机形态：演示模式初始开关（可运行时切换），生产形态默认关闭 */
  diagnostics: boolean
  /** 当前平台 id（能力表键），用于三维求交与状态原因码 */
  platformId: string
  /** 该平台开放的能力清单，组合根按能力矩阵闸门下发 */
  availableDomains: readonly string[]
  /** 主窗口引用：打印隐藏窗挂 parent，主窗销毁时级联销毁，避免进程常驻 */
  getParent?: () => BrowserWindow | undefined
  /** 拍摄浮层宿主：由组合根注入窗口系统实现，域内不认识 BrowserWindow 归属 */
  captureOverlay?: CaptureOverlayHost
}

export interface DeviceGateway {
  domains: DomainDefinition[]
  /** 各能力设备状态（state + 原因码），诊断台与灰置逻辑的唯一数据源 */
  readonly deviceStatuses: readonly DeviceStatus[]
  /** 各能力参数统一底座：出厂档案 + 现场覆盖 + 恢复出厂 */
  readonly configCenter: DeviceConfigCenter
  /** 写入参数：更新中心文档并同步到域运行时 */
  applyConfig: (capabilityId: string, deviceProfileId: string, patch: Record<string, unknown>) => Promise<void>
  /** 恢复出厂：清覆盖并把出厂值写回域运行时 */
  resetConfig: (capabilityId?: string) => Promise<void>
  /** 演示模式状态查询与切换：仿真注入类方法据此放行 */
  isDemoMode: () => boolean
  setDemoMode: (enabled: boolean) => void
  /** 拍摄浮层会话服务：注入宿主后才创建，组合根据此注册会话通道 */
  captureDialog?: CaptureDialogSessionService
  /** 预热守护进程（含 koffi 加载）；完成即打 t2DeviceHostReady */
  warmup: (onReady: () => void) => Promise<void>
  /** 工作台窗口就绪后调用：scanner 键盘观察挂到窗口（域方法不依赖窗口时序） */
  attachShellWindow: (win: BrowserWindow) => void
  dispose: () => void
}

/** 统一装配上下文：各装配器面对同一份事实，各自只取所需字段。 */
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
  demoMode: DemoModeState
  /** 现场默认打印参数：配置中心写入时同步，打印系统提交时读取 */
  printDefaults: { options: Record<string, unknown> }
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
  return { events: ctx.events, demoMode: ctx.demoMode }
}

/** 档案覆盖持久化：出厂默认 + 现场覆盖，读写共用一份存储。 */
function overrideStore(ctx: AssemblyContext, fileName: string) {
  return overridesStore(join(ctx.storageRoot, fileName))
}

/** 中心补丁转换所需的上下文；activeId 仅声明了 needsActiveId 的域会拿到值。 */
interface SetConfigArgs {
  deviceProfileId: string
  patch: Record<string, unknown>
  activeId?: string
}

/**
 * 单条能力登记：装配器、配置档案、setConfig 形状、缺省同步钩子、通道声明集中在一处。
 * `Record<DeviceCapabilityId, DomainSpec>` 让新增能力域漏登记任一项时编译不通过。
 */
interface DomainSpec {
  /** 出厂档案来自各域代码即配置，中心只保存白名单覆盖 */
  config: Pick<DeviceCapabilitySpec, 'overridableKeys' | 'profiles'>
  /** 中心补丁 → 该域 setConfig 入参形状；无 setConfig 的域省略 */
  toSetConfigInput?: (args: SetConfigArgs) => Record<string, unknown>
  /** setConfig 前需读取当前激活档案 id */
  needsActiveId?: boolean
  /** 该能力声明的通道，供诊断台求交取真实 channelId */
  channels: readonly ChannelDescriptor[]
  /** 配置变更后把缺省参数同步进域运行时 */
  syncDefaults?: (ctx: AssemblyContext, current: Record<string, unknown>) => void
  assemble: DomainAssembler
}

const DEFAULT_SET_CONFIG: DomainSpec['toSetConfigInput'] = ({ deviceProfileId, patch }) => ({ deviceProfileId, overrides: patch })

/** 供装配一致性断言读取；运行期只由目录派生，不外部写入。 */
export const DOMAIN_SPECS: Readonly<Record<DeviceCapabilityId, DomainSpec>> = {
  print: {
    config: {
      overridableKeys: ['paper', 'channel', 'preview', 'dryRun', 'silent', 'copies'],
      profiles: [{ id: 'print-default', paper: 'A4', channel: 'auto', preview: false, dryRun: false, silent: true, copies: 1 }],
    },
    channels: PRINT_CHANNELS,
    syncDefaults: (ctx, current) => {
      ctx.printDefaults.options = Object.fromEntries(Object.entries(current).filter(([key]) => key !== 'id'))
    },
    assemble: (ctx) => {
      const system = createPrintSystem({
        jobsFile: join(ctx.storageRoot, 'print-jobs.json'),
        archiveDir: join(ctx.filesRoot, 'print'),
        sumatraPath: ctx.sumatraPath,
        host: ctx.host,
        getParent: ctx.getParent,
        allowedOrigins: ctx.allowedOrigins,
        logger: ctx.logger.scope('devices:print'),
        defaultOptions: () => ctx.printDefaults.options,
      })
      return { id: 'print', definition: createPrintDomain(system), dispose: () => system.destroy() }
    },
  },
  capture: {
    config: { overridableKeys: ['displayName', 'ws', 'service'], profiles: BUILT_IN_CAPTURE_CONFIGS },
    toSetConfigInput: DEFAULT_SET_CONFIG,
    channels: CAPTURE_CHANNELS,
    assemble: (ctx) => {
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
  },
  idcard: {
    config: { overridableKeys: ['displayName', 'ws'], profiles: BUILT_IN_IDCARD_CONFIGS },
    toSetConfigInput: DEFAULT_SET_CONFIG,
    channels: IDCARD_CHANNELS,
    assemble: (ctx) => {
      const system = createIdCardSystem({
        resourcesRoot: ctx.resourcesRoot,
        host: ctx.host,
        logger: ctx.logger.scope('devices:idcard'),
      })
      return { id: 'idcard', definition: createIdcardDomain(system), dispose: () => system.destroy() }
    },
  },
  iccard: {
    config: { overridableKeys: ['displayName', 'ws'], profiles: BUILT_IN_ICCARD_CONFIGS },
    toSetConfigInput: DEFAULT_SET_CONFIG,
    channels: ICCARD_CHANNELS,
    assemble: (ctx) => {
      const system = createIcCardSystem({
        resourcesRoot: ctx.resourcesRoot,
        host: ctx.host,
        logger: ctx.logger.scope('devices:iccard'),
      })
      return { id: 'iccard', definition: createIccardDomain(system), dispose: () => system.destroy() }
    },
  },
  scanner: {
    config: {
      overridableKeys: ['displayName', 'timeout', 'minLength', 'endKey', 'prefixes', 'requirePrefix', 'hidUrl'],
      profiles: SCANNER_DEFAULTS.devices,
    },
    needsActiveId: true,
    toSetConfigInput: ({ deviceProfileId, patch, activeId }) => ({
      enabled: true,
      activeProfileId: activeId ?? deviceProfileId,
      deviceId: deviceProfileId,
      overrides: patch,
    }),
    channels: SCANNER_CHANNELS,
    assemble: (ctx) => {
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
  },
  signature: {
    config: { overridableKeys: ['displayName', 'ws'], profiles: BUILT_IN_SIGNATURE_CONFIGS },
    toSetConfigInput: DEFAULT_SET_CONFIG,
    channels: SIGNATURE_CHANNELS,
    assemble: (ctx) => {
      const system = createSignatureSystem({
        resourcesRoot: ctx.resourcesRoot,
        host: ctx.host,
        logger: ctx.logger.scope('devices:signature'),
      })
      return { id: 'signature', definition: createSignatureDomain(system, domainDeps(ctx)), dispose: () => system.destroy() }
    },
  },
}

/** 配置档案从能力身份表派生，label 不再各写一份。 */
export const CONFIG_CAPABILITIES: readonly DeviceCapabilitySpec[] = DEVICE_CAPABILITIES.map(
  ({ id, label }) => ({ id, label, ...DOMAIN_SPECS[id].config }),
)

/** 各能力声明的通道汇总，供诊断台状态取真实 channelId。 */
export function channelIdFor(capabilityId: string, platformId: string): string | undefined {
  const spec = DOMAIN_SPECS[capabilityId as DeviceCapabilityId]
  return spec?.channels.find(
    d => d.capabilityId === capabilityId && (!d.platformIds.length || d.platformIds.includes(platformId)),
  )?.id
}

export function createDeviceGateway(options: DeviceGatewayOptions): DeviceGateway {
  const log = options.logger.scope('devices')
  const host = new DeviceHost(options.logger, options.hostEntryPath)
  const demoMode: DemoModeState = { enabled: options.diagnostics }
  const printDefaults = { options: {} as Record<string, unknown> }
  const sumatraFile = selectSumatraPdfFile(process.arch, rel => existsSync(options.driver.resolve(rel)))
  const ctx: AssemblyContext = {
    logger: options.logger,
    events: options.events,
    host,
    resourcesRoot: options.driver.assetRoot,
    sumatraPath: options.driver.resolve(sumatraFile),
    storageRoot: options.paths.storageRoot,
    filesRoot: options.paths.filesRoot,
    allowedOrigins: options.allowedOrigins,
    demoMode,
    printDefaults,
    getParent: options.getParent,
    captureOverlay: options.captureOverlay,
  }

  // 查表装配：平台代码零分支，能力清单由 DEVICE_CAPABILITY_IDS 统一给定
  const assembled = DEVICE_CAPABILITY_IDS.map(id => DOMAIN_SPECS[id].assemble(ctx))
  const domains = assembled.map(a => a.definition)
  const capture = assembled.find(a => a.capture)?.capture
  const captureDialog = options.captureOverlay && capture
    ? new CaptureDialogSessionService({ capture, overlay: options.captureOverlay })
    : undefined

  // 三维注册表与平台档案求交，产出各能力状态与原因码；诊断台读同一份结果
  const deviceRegistry = createDeviceRegistry(createChannelRegistry())
  registerStandardCatalog(deviceRegistry)
  const resolutions = deviceRegistry.resolveAll(options.platformId, false)
  const deviceStatuses = buildDeviceStatuses(
    CAPABILITY_DESCRIPTORS,
    resolutions,
    options.availableDomains,
    options.platformId,
    channelIdFor,
  )

  const configPersistence = overridesStore(join(ctx.storageRoot, 'device-config.json'))
  const configCenter = createDeviceConfigCenter({
    capabilities: CONFIG_CAPABILITIES,
    read: () => configPersistence.read<StoredConfigDocument>(),
    write: doc => configPersistence.write(doc),
  })
  const internalCtx: DomainCallContext = { appId: 'shell', instanceId: 'shell', log: () => {} }

  /** 配置变更后把各能力声明的缺省参数同步进对应域运行时；启动时取回已持久化值。 */
  function syncRuntimeDefaults(): void {
    for (const id of DEVICE_CAPABILITY_IDS) {
      const sync = DOMAIN_SPECS[id].syncDefaults
      if (!sync) { continue }
      const current = configCenter.snapshot(id)[0]?.profiles[0]?.current
      if (current) { sync(ctx, current) }
    }
  }
  syncRuntimeDefaults()

  async function callSetConfig(capabilityId: string, deviceProfileId: string, patch: Record<string, unknown>): Promise<void> {
    const spec = DOMAIN_SPECS[capabilityId as DeviceCapabilityId]
    const setConfig = spec?.toSetConfigInput && domains.find(d => d.name === capabilityId)?.methods.setConfig
    if (!spec?.toSetConfigInput || !setConfig) { return }
    let activeId: string | undefined
    if (spec.needsActiveId) {
      const current = await domains.find(d => d.name === capabilityId)?.methods.getConfig?.handler(undefined, internalCtx)
      if (current && typeof current === 'object' && 'activeId' in current) {
        activeId = String((current as { activeId: unknown }).activeId)
      }
    }
    const input = spec.toSetConfigInput({ deviceProfileId, patch, activeId })
    await setConfig.handler(setConfig.input.parse(input), internalCtx)
  }

  return {
    domains,
    deviceStatuses,
    configCenter,
    captureDialog,

    async applyConfig(capabilityId, deviceProfileId, patch) {
      configCenter.setOverrides(capabilityId, deviceProfileId, patch)
      await callSetConfig(capabilityId, deviceProfileId, patch)
      syncRuntimeDefaults()
    },

    async resetConfig(capabilityId) {
      configCenter.resetToFactory(capabilityId)
      for (const entry of configCenter.factoryPatches(capabilityId)) {
        await callSetConfig(entry.capabilityId, entry.deviceProfileId, entry.patch)
      }
      syncRuntimeDefaults()
    },

    isDemoMode() { return demoMode.enabled },
    setDemoMode(enabled) { demoMode.enabled = enabled },

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
