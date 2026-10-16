import type { ScannerConfig, ScannerLogFn, ScanResult } from '@desktop/shared'
import type { BrowserWindow } from 'electron'
import { scannerDomain } from '@desktop/shared'
import { webContents } from 'electron'
import { KeyboardScanner } from './keyboard-scanner'

/** 扫码枪出厂默认（单一数据源；运行时修改经 persist 写 userData） */
export const SCANNER_DEFAULTS: ScannerConfig = {
  enabled: true,
  timeout: 100,
  minLength: 4,
  endKey: 'Enter',
  prefixes: [],
  requirePrefix: false,
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
 * 结果广播到所有窗口（推送通道见 scannerDomain.channels.onScan）。
 */
export class ScanService {
  private config: ScannerConfig
  private scanner: KeyboardScanner
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
  }

  private buildScanner(): KeyboardScanner {
    return new KeyboardScanner(this.config, result => this.broadcast(result))
  }

  attachWindow(win: BrowserWindow): void {
    win.webContents.on('before-input-event', (_event, input) => {
      if (!this.config.enabled) { return }
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
      if (!wc.isDestroyed()) { wc.send(scannerDomain.channels.onScan, result) }
    }
  }

  getConfig(): ScannerConfig {
    return { ...this.config }
  }

  setConfig(patch: Partial<ScannerConfig>): ScannerConfig {
    this.config = { ...this.config, ...patch }
    this.scanner = this.buildScanner()
    this.persist?.(this.config)
    return { ...this.config }
  }

  simulate(code: string): ScanResult {
    this.scanner.processComplete(code)
    return this.lastScan ?? { code, prefix: null, rawCode: code, timestamp: Date.now() }
  }

  destroy(): void {
    this.scanner.reset()
  }
}
