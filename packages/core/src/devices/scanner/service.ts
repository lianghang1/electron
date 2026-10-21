import type { ScannerConfig, ScannerDeviceConfig, ScannerLogFn, ScannerStatus, ScanOptions, ScanResult } from '@desktop/shared'
import type { BrowserWindow } from 'electron'
import { scannerDomain } from '@desktop/shared'
import { webContents } from 'electron'
import { HID_SERVICE_URL, HidScanner } from './hid-scanner'
import { KeyboardScanner } from './keyboard-scanner'

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

/** 旧版单值配置（v1 根对象直存节奏参数 + mode/hidUrl），识别后迁移为档案制 */
interface LegacyScannerConfig extends Required<ScanOptions> {
  enabled: boolean
  mode: 'keyboard' | 'hid'
  hidUrl: string
}

/** 旧持久化迁移：单值节奏参数 → keyboard/hid 双档案，激活档案按旧 mode 指向 */
function migrateConfig(raw: LegacyScannerConfig | ScannerConfig): ScannerConfig {
  if ('devices' in raw && Array.isArray(raw.devices)) {
    return raw as ScannerConfig
  }
  const legacy = raw as LegacyScannerConfig
  const pace = {
    timeout: legacy.timeout ?? PACE_DEFAULTS.timeout,
    minLength: legacy.minLength ?? PACE_DEFAULTS.minLength,
    endKey: legacy.endKey ?? PACE_DEFAULTS.endKey,
    prefixes: Array.isArray(legacy.prefixes) ? legacy.prefixes : PACE_DEFAULTS.prefixes,
    requirePrefix: legacy.requirePrefix ?? PACE_DEFAULTS.requirePrefix,
  }
  const devices: ScannerDeviceConfig[] = [
    { ...pace, id: 'keyboard-local', displayName: '本机键盘仿真枪', brand: '通用', transport: 'keyboard' },
    { ...pace, id: 'camsdk-hid', displayName: 'CamSDK HID 通道（本地服务 9000）', brand: 'CamSDK', transport: 'hid', hidUrl: legacy.hidUrl ?? HID_SERVICE_URL },
  ]
  return { enabled: legacy.enabled ?? true, activeId: legacy.mode === 'hid' ? 'camsdk-hid' : 'keyboard-local', devices }
}

export interface ScannerSystem {
  /** 窗口接入：before-input-event 观察键盘（不消费，人工输入不受影响），结果广播到所有窗口 */
  attachWindow: (win: BrowserWindow) => void
  getConfig: () => ScannerConfig
  /** 全量替换域配置（enabled/activeId/devices；入参合法性由 IPC 层 sanitize），写穿持久化 */
  setConfig: (next: ScannerConfig) => ScannerConfig
  /** 模拟一条扫码（诊断/演示：走与真枪完全相同的缓冲 → 广播链路） */
  simulate: (code: string) => ScanResult
  destroy: () => void
}

/**
 * ScanService = 扫码枪域统一 API。
 * 精华在 before-input-event：键盘事件在到达页面前被"观察"（不 preventDefault），
 * 扫码枪在任何输入焦点下都能被识别，且不会污染人工输入；缓冲器靠节奏+长度区分人与枪。
 * 档案制：节奏/通道参数随档案走，激活档案（activeId）决定当前生效通道与参数。
 * 结果广播到所有窗口（推送通道见 scannerDomain.channels.scanReceived）。
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
    private readonly initialConfig: ScannerConfig = SCANNER_DEFAULTS,
    private readonly persist?: (config: ScannerConfig) => void,
    logger: ScannerLogFn = () => {},
  ) {
    this.logger = logger
    this.config = migrateConfig(initialConfig)
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
      if (!wc.isDestroyed()) { wc.send(scannerDomain.channels.scanReceived, result) }
    }
  }

  getConfig(): ScannerConfig {
    return {
      ...this.config,
      devices: this.config.devices.map(d => ({ ...d, prefixes: [...d.prefixes] })),
    }
  }

  setConfig(next: ScannerConfig): ScannerConfig {
    this.config = { ...next, devices: next.devices.map(d => ({ ...d, prefixes: [...d.prefixes] })) }
    this.scanner = this.buildScanner()
    this.syncHid()
    this.persist?.(this.getConfig())
    return this.getConfig()
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
      if (!wc.isDestroyed()) { wc.send(scannerDomain.channels.statusUpdated, status) }
    }
  }
}
