import type { ScannerConfig, ScannerLogFn, ScannerStatus, ScanResult } from '@desktop/shared'
import type { BrowserWindow } from 'electron'
import { scannerDomain } from '@desktop/shared'
import { webContents } from 'electron'
import { HID_SERVICE_URL, HidScanner } from './hid-scanner'
import { KeyboardScanner } from './keyboard-scanner'

/** 扫码枪出厂默认（单一数据源；运行时修改经 persist 写 userData） */
export const SCANNER_DEFAULTS: ScannerConfig = {
  enabled: true,
  timeout: 100,
  minLength: 4,
  endKey: 'Enter',
  prefixes: [],
  requirePrefix: false,
  mode: 'keyboard',
  hidUrl: HID_SERVICE_URL,
}

export interface ScannerSystem {
  /** 窗口接入：before-input-event 观察键盘（不消费，人工输入不受影响），结果广播到所有窗口 */
  attachWindow: (win: BrowserWindow) => void
  getConfig: () => ScannerConfig
  setConfig: (patch: Partial<ScannerConfig>) => ScannerConfig
  /** 模拟一条扫码（诊断/演示：走与真枪完全相同的缓冲 → 广播链路） */
  simulate: (code: string) => ScanResult
  destroy: () => void
}

/**
 * ScanService = 扫码枪域统一 API。
 * 精华在 before-input-event：键盘事件在到达页面前被"观察"（不 preventDefault），
 * 扫码枪在任何输入焦点下都能被识别，且不会污染人工输入；缓冲器靠节奏+长度区分人与枪。
 * 结果广播到所有窗口（推送通道见 scannerDomain.channels.scanReceived）。
 */
export class ScanService {
  private config: ScannerConfig
  private scanner: KeyboardScanner
  /** HID 通道（mode='hid' 且总开关开启时持有，键盘仿真缓冲器互不冲突） */
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
    this.config = { ...initialConfig }
    this.scanner = this.buildScanner()
    // 启动即按配置接管 HID 通道（键盘仿真与 HID 通道互斥，由 mode 决定）
    this.syncHid()
  }

  private buildScanner(): KeyboardScanner {
    return new KeyboardScanner(this.config, result => this.broadcast(result))
  }

  attachWindow(win: BrowserWindow): void {
    win.webContents.on('before-input-event', (_event, input) => {
      // 仅键盘仿真通道观察按键；HID 通道条码由厂商服务推送，键盘事件与人工输入完全无关
      if (!this.config.enabled || this.config.mode !== 'keyboard') { return }
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
    return { ...this.config }
  }

  setConfig(patch: Partial<ScannerConfig>): ScannerConfig {
    this.config = { ...this.config, ...patch }
    this.scanner = this.buildScanner()
    this.syncHid()
    this.persist?.(this.config)
    return { ...this.config }
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

  /** 按配置同步 HID 通道：开启条件 = 总开关开 且 mode='hid'；服务地址变更时重建（重建/关闭通道并推送状态） */
  private syncHid(): void {
    const wanted = this.config.enabled && this.config.mode === 'hid'
    if (wanted && (!this.hid || this.hidUrl !== this.config.hidUrl)) {
      this.hid?.stop()
      this.hidUrl = this.config.hidUrl
      this.hid = new HidScanner(
        this.config.hidUrl,
        new KeyboardScanner(this.config, result => this.broadcast(result)),
        result => this.broadcast(result),
        status => this.pushStatus(status),
      )
      this.hid.start()
      this.logger('info', `扫码通道切换为 HID（${this.config.hidUrl}）`)
      return
    }
    if (!wanted && this.hid) {
      this.hid.stop()
      this.hid = null
      this.pushStatus({ mode: this.config.mode, connected: true })
      this.logger('info', `扫码通道切换为 ${this.config.mode}`)
    }
  }

  private pushStatus(status: ScannerStatus): void {
    for (const wc of webContents.getAllWebContents()) {
      if (!wc.isDestroyed()) { wc.send(scannerDomain.channels.statusUpdated, status) }
    }
  }
}
