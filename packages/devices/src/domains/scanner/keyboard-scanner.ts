import type { ScanOptions, ScanResult } from '@shell/shared'

/**
 * 键盘仿真扫码枪缓冲器（纯逻辑，零依赖，可在无 Electron 环境单测）。
 * 消化自生产项目 BarcodeScanner：缓冲 + 节奏超时 + 结束键 + 前缀过滤。
 */
export class KeyboardScanner {
  private buffer = ''
  private timer: ReturnType<typeof setTimeout> | null = null
  private active = false

  constructor(
    // 注意：enabled 是服务层总开关，不在此列
    private readonly options: Required<ScanOptions>,
    private readonly onScan: (result: ScanResult) => void,
  ) {}

  /** 喂入一个按键（只接 keyDown 的 key；不消费事件，键盘输入不受影响） */
  addKey(key: string): void {
    if (key.length > 1 && key !== this.options.endKey) { return } // 忽略修饰键等

    if (this.timer) { clearTimeout(this.timer) }

    if (key === this.options.endKey) {
      this.flush()
      return
    }
    if (key.length === 1) {
      this.buffer += key
      this.active = true
      this.timer = setTimeout(() => this.flush(), this.options.timeout)
    }
  }

  /** 直接处理一条完整条码（模拟/外部接入用） */
  processComplete(code: string): void {
    if (!code || code.length < this.options.minLength) { return }
    this.emit(code)
  }

  reset(): void {
    this.buffer = ''
    this.active = false
    if (this.timer) { clearTimeout(this.timer) }
    this.timer = null
  }

  private flush(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (!this.active) { return }
    if (this.buffer.length < this.options.minLength) {
      this.reset()
      return
    }
    this.emit(this.buffer)
  }

  private emit(code: string): void {
    let prefix: string | null = null
    for (const p of this.options.prefixes) {
      if (code.startsWith(p)) {
        prefix = p
        break
      }
    }
    if (this.options.requirePrefix && !prefix) {
      this.reset()
      return
    }
    this.onScan({
      code,
      prefix,
      rawCode: prefix ? code.slice(prefix.length) : code,
      timestamp: Date.now(),
    })
    this.reset()
  }
}
