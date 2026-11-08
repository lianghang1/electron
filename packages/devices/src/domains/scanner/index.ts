import type { Logger } from '@shell/kernel/logger'
import type { ScannerConfig, ScannerLogFn, ScannerOverrides, ScannerSetInput, ScanResult } from '@shell/shared'
import type { BrowserWindow } from 'electron'
import { ScanService } from './service'

export { SCANNER_DEFAULTS, SCANNER_OVERRIDES_DEFAULTS } from './service'

export interface ScannerSystemOptions {
  /** 现场白名单覆盖（core 经 electron-store 回注；不传 = 出厂默认） */
  initialOverrides?: ScannerOverrides
  /** 运行时修改持久化（白名单覆盖形状；未注入则 setConfig 仅内存生效） */
  persist?: (config: ScannerOverrides) => void
  /** 结构化日志（扫码内容会入日志，按业务合规取舍） */
  logger?: Logger
}

export interface ScannerSystem {
  /** 窗口接入：before-input-event 观察键盘（不消费，人工输入不受影响） */
  attachWindow: (win: BrowserWindow) => void
  getConfig: () => ScannerConfig
  /** 提交域级开关/激活指向 + 单档案白名单覆盖（档案 id 必须为出厂预设项），写穿持久化 */
  setConfig: (input: ScannerSetInput) => ScannerConfig
  /** 模拟一条扫码（诊断/演示：走与真枪完全相同的缓冲 → 广播链路） */
  simulate: (code: string) => ScanResult
  destroy: () => void
}

/** 创建扫码枪系统（scanner 域通道由 core/src/ipc/scanner.ts 注册） */
export function createScannerSystem(options: ScannerSystemOptions = {}): ScannerSystem {
  const log: ScannerLogFn = (level, message, meta) => options.logger?.[level](message, meta)
  const service = new ScanService(options.initialOverrides, options.persist, log)
  return {
    attachWindow: win => service.attachWindow(win),
    getConfig: () => service.getConfig(),
    setConfig: input => service.setConfig(input),
    simulate: code => service.simulate(code),
    destroy: () => service.destroy(),
  }
}
