import type { ScannerConfig, ScannerDeviceConfig, ScannerDeviceOverrides, ScannerLogFn, ScannerOverrides, ScannerSetInput, ScannerStatus, ScanResult } from '@shell/shared'
import type { BrowserWindow } from 'electron'
import { DesktopError } from '@shell/shared'
import { webContents } from 'electron'
import { HID_SERVICE_URL, HidScanner } from './hid-scanner'
import { KeyboardScanner } from './keyboard-scanner'

/** 推送通道（沿用旧域通道命名 `${域}:${方法}`；bridge preload 已做 scanner.scanned → 旧通道映射） */
export const SCANNER_PUSH_CHANNELS = { scanReceived: 'scanner:scanReceived', statusUpdated: 'scanner:statusUpdated' } as const

/** 节奏参数出厂值（keyboard / hid 档案共用一份缺省，旧单值迁移也以此回填） */
const PACE_DEFAULTS = { timeout: 100, minLength: 4, endKey: 'Enter', prefixes: [] as string[], requirePrefix: false }

/**
 * 扫码枪出厂档案（代码即配置，与 capture 同构）：
 * keyboard 档案 = 本机直连枪（键盘仿真）；hid 档案 = CamSDKServer 本地服务 HID 通道。
 * 运行时编辑（UI setConfig）写穿 device-scanner.json，启动时回注。
 */
export const SCANNER_DEFAULTS: ScannerConfig = {
  enabled: true,
  activeId: 'keyboard-local',
  devices: [
    { ...PACE_DEFAULTS, id: 'keyboard-local', displayName: '本机键盘仿真枪', brand: '通用', transport: 'keyboard' },
    { ...PACE_DEFAULTS, id: 'camsdk-hid', displayName: 'CamSDK HID 通道（本地服务 9000）', brand: 'CamSDK', transport: 'hid', hidUrl: HID_SERVICE_URL },
  ],
}

/** 白名单覆盖缺省（持久化 store 默认值；档案本体见 SCANNER_DEFAULTS，清单由代码预设） */
export const SCANNER_OVERRIDES_DEFAULTS: ScannerOverrides = {
  enabled: true,
  activeId: SCANNER_DEFAULTS.activeId,
  devices: [],
}

/** 旧版单值配置（v1 根对象直存节奏参数 + mode/hidUrl），逐字段读取，缺字段不生效 */
const asNumber = (v: unknown): number | undefined => typeof v === 'number' ? v : undefined
const asString = (v: unknown): string | undefined => typeof v === 'string' ? v : undefined
const asBoolean = (v: unknown): boolean | undefined => typeof v === 'boolean' ? v : undefined

/** 白名单字段就地覆盖（仅提供且合法的字段生效；旧整条持久化按同名字段读取，brand/transport 等自然忽略） */
function applyOverrides(profile: ScannerDeviceConfig, s: ScannerDeviceOverrides): void {
  if (typeof s.displayName === 'string' && s.displayName.trim()) {
    profile.displayName = s.displayName
  }
  if (typeof s.timeout === 'number' && s.timeout > 0) {
    profile.timeout = s.timeout
  }
  if (typeof s.minLength === 'number' && s.minLength >= 0) {
    profile.minLength = s.minLength
  }
  if (typeof s.endKey === 'string' && s.endKey.trim()) {
    profile.endKey = s.endKey
  }
  if (Array.isArray(s.prefixes) && s.prefixes.every(x => typeof x === 'string')) {
    profile.prefixes = [...s.prefixes]
  }
  if (typeof s.requirePrefix === 'boolean') {
    profile.requirePrefix = s.requirePrefix
  }
  if (profile.transport === 'hid' && typeof s.hidUrl === 'string' && s.hidUrl.trim()) {
    profile.hidUrl = s.hidUrl.trim()
  }
}

/** 档案 → 白名单覆盖（持久化只写现场可调字段，品牌/通道永远随代码出厂） */
function overridesOf(profile: ScannerDeviceConfig): ScannerDeviceOverrides {
  return {
    id: profile.id,
    displayName: profile.displayName,
    timeout: profile.timeout,
    minLength: profile.minLength,
    endKey: profile.endKey,
    prefixes: [...profile.prefixes],
    requirePrefix: profile.requirePrefix,
    ...(profile.transport === 'hid' && profile.hidUrl ? { hidUrl: profile.hidUrl } : {}),
  }
}

/**
 * 历史持久化合并 + 白名单提取：以出厂档案为基准，stored 同 id 仅提取白名单字段
 * （名称/节奏参数/HID 地址）覆盖——代码修改技术字段（品牌/通道）立即生效，
 * 本地旧数据不再整体压住出厂值；不在出厂清单内的档案忽略（清单完全由代码预设决定）。
 * 旧 v1 单值配置（无 devices 数组）：节奏参数落到全部档案、HID 地址落到 hid 档案、激活按旧 mode 指向。
 */
function migrateScannerConfig(stored?: ScannerOverrides): ScannerConfig {
  const base = structuredClone(SCANNER_DEFAULTS)
  const raw = stored && typeof stored === 'object' ? stored as ScannerOverrides & Record<string, unknown> : undefined
  const storedDevices = Array.isArray(raw?.devices) ? raw.devices : []
  const legacy = raw && !Array.isArray(raw.devices)
    ? {
        timeout: asNumber(raw.timeout),
        minLength: asNumber(raw.minLength),
        endKey: asString(raw.endKey),
        prefixes: Array.isArray(raw.prefixes)
          ? raw.prefixes.filter((x): x is string => typeof x === 'string')
          : undefined,
        requirePrefix: asBoolean(raw.requirePrefix),
        hidUrl: asString(raw.hidUrl),
        mode: raw.mode === 'hid' || raw.mode === 'keyboard' ? raw.mode : undefined,
      }
    : undefined
  const legacyPace: ScannerDeviceOverrides | undefined = legacy
    ? {
        timeout: legacy.timeout,
        minLength: legacy.minLength,
        endKey: legacy.endKey,
        prefixes: legacy.prefixes,
        requirePrefix: legacy.requirePrefix,
      }
    : undefined
  const devices = base.devices.map((profile) => {
    const s = storedDevices.find(x => x && x.id === profile.id)
    if (s) {
      applyOverrides(profile, s)
    }
    else if (legacyPace) {
      applyOverrides(profile, { ...legacyPace, ...(profile.transport === 'hid' && legacy?.hidUrl ? { hidUrl: legacy.hidUrl } : {}) })
    }
    return profile
  })
  const enabled = raw?.enabled !== false
  const wantedActive = typeof raw?.activeId === 'string' && raw.activeId
    ? raw.activeId
    : legacy?.mode === 'hid' ? 'camsdk-hid' : undefined
  const activeId = wantedActive && devices.some(d => d.id === wantedActive) ? wantedActive : base.activeId
  return { enabled, activeId, devices }
}

export interface ScannerSystem {
  /** 窗口接入：before-input-event 观察键盘（不消费，人工输入不受影响），结果广播到所有窗口 */
  attachWindow: (win: BrowserWindow) => void
  getConfig: () => ScannerConfig
  /** 提交域级开关/激活指向 + 单档案白名单覆盖（档案 id 必须为出厂预设项），写穿持久化 */
  setConfig: (input: ScannerSetInput) => ScannerConfig
  /** 模拟一条扫码（诊断/演示：走与真枪完全相同的缓冲 → 广播链路） */
  simulate: (code: string) => ScanResult
  destroy: () => void
}

/**
 * ScanService = 扫码枪域统一 API。
 * 精华在 before-input-event：键盘事件在到达页面前被"观察"（不 preventDefault），
 * 扫码枪在任何输入焦点下都能被识别，且不会污染人工输入；缓冲器靠节奏+长度区分人与枪。
 * 档案制：节奏/通道参数随档案走，激活档案（activeId）决定当前生效通道与参数。
 * 结果广播到所有窗口（推送通道见 SCANNER_PUSH_CHANNELS.scanReceived）。
 */
export class ScanService {
  private config: ScannerConfig
  private scanner: KeyboardScanner
  /** HID 通道（激活档案为 hid 且总开关开启时持有，键盘仿真缓冲器互不冲突） */
  private hid: HidScanner | null = null
  /** 当前 HID 通道使用的服务地址（url 变更时重建通道） */
  private hidUrl: string | null = null
  private lastScan: ScanResult | null = null
  private readonly logger: ScannerLogFn

  constructor(
    initialOverrides: ScannerOverrides = { enabled: true, activeId: SCANNER_DEFAULTS.activeId, devices: [] },
    private readonly persist?: (config: ScannerOverrides) => void,
    logger: ScannerLogFn = () => {},
  ) {
    this.logger = logger
    this.config = migrateScannerConfig(initialOverrides)
    this.scanner = this.buildScanner()
    // 启动即按激活档案接管通道（键盘仿真与 HID 通道互斥，由激活档案 transport 决定）
    this.syncHid()
  }

  /** 当前生效档案（activeId 失效时回落第一个档案） */
  private activeDevice(): ScannerDeviceConfig {
    return this.config.devices.find(d => d.id === this.config.activeId) ?? this.config.devices[0]
  }

  private buildScanner(): KeyboardScanner {
    return new KeyboardScanner(this.activeDevice(), result => this.broadcast(result))
  }

  attachWindow(win: BrowserWindow): void {
    win.webContents.on('before-input-event', (_event, input) => {
      // 仅键盘仿真通道观察按键；HID 通道条码由厂商服务推送，键盘事件与人工输入完全无关
      if (!this.config.enabled || this.activeDevice().transport !== 'keyboard') { return }
      if (input.type !== 'keyDown') { return }
      this.scanner.addKey(input.key)
    })
  }

  private broadcast(result: ScanResult): void {
    this.lastScan = result
    this.logger('info', `扫码 ${result.code}`, { prefix: result.prefix })
    // 全量 webContents（BrowserWindow + shell Tab 的 WebContentsView 都在内），
    // 只遍历 BrowserWindow 会漏掉 Tab 装载的页面
    for (const wc of webContents.getAllWebContents()) {
      if (!wc.isDestroyed()) { wc.send(SCANNER_PUSH_CHANNELS.scanReceived, result) }
    }
  }

  getConfig(): ScannerConfig {
    return {
      ...this.config,
      devices: this.config.devices.map(d => ({ ...d, prefixes: [...d.prefixes] })),
    }
  }

  /** 运行时现场白名单覆盖：域级开关/激活指向 + 单档案覆盖（档案 id 必须为出厂预设项），写穿持久化 */
  setConfig(input: ScannerSetInput): ScannerConfig {
    const profile = this.config.devices.find(d => d.id === input.deviceId)
    if (!profile) {
      throw new DesktopError('VALIDATION_FAILED', `扫码枪档案不存在: ${input.deviceId}`)
    }
    applyOverrides(profile, input.overrides ?? {})
    this.config.enabled = input.enabled !== false
    if (this.config.devices.some(d => d.id === input.activeId)) {
      this.config.activeId = input.activeId
    }
    this.scanner = this.buildScanner()
    this.syncHid()
    this.persist?.(this.storedConfig())
    return this.getConfig()
  }

  /** 持久化形状：域级开关 + 激活指向 + 档案白名单覆盖（技术字段永远随代码出厂） */
  private storedConfig(): ScannerOverrides {
    return { enabled: this.config.enabled, activeId: this.config.activeId, devices: this.config.devices.map(overridesOf) }
  }

  simulate(code: string): ScanResult {
    // 诊断注入走当前通道的过滤链（HID/键盘同规则），与真枪链路一致
    const target = this.hid ?? this.scanner
    target.processComplete(code)
    return this.lastScan ?? { code, prefix: null, rawCode: code, timestamp: Date.now() }
  }

  destroy(): void {
    this.scanner.reset()
    this.hid?.stop()
    this.hid = null
  }

  /** 按激活档案同步通道：开启条件 = 总开关开 且 激活档案为 hid；服务地址变更时重建（重建/关闭通道并推送状态） */
  private syncHid(): void {
    const active = this.activeDevice()
    const wanted = this.config.enabled && active.transport === 'hid' && !!active.hidUrl
    if (wanted && active.hidUrl && (!this.hid || this.hidUrl !== active.hidUrl)) {
      this.hid?.stop()
      this.hidUrl = active.hidUrl
      this.hid = new HidScanner(
        active.hidUrl,
        new KeyboardScanner(active, result => this.broadcast(result)),
        result => this.broadcast(result),
        status => this.pushStatus(status),
      )
      this.hid.start()
      this.logger('info', `扫码通道切换为 HID（${active.hidUrl}）`)
      return
    }
    if (!wanted && this.hid) {
      this.hid.stop()
      this.hid = null
      this.pushStatus({ mode: active.transport, connected: true })
      this.logger('info', `扫码通道切换为 ${active.transport}`)
    }
  }

  private pushStatus(status: ScannerStatus): void {
    for (const wc of webContents.getAllWebContents()) {
      if (!wc.isDestroyed()) { wc.send(SCANNER_PUSH_CHANNELS.statusUpdated, status) }
    }
  }
}
