import type { ScannerConfig, ScannerLogFn, ScanResult } from '@desktop/shared'
import type { BrowserWindow } from 'electron'
import type { Logger } from '../../logger/logger'
import { ScanService } from './service'

export { SCANNER_DEFAULTS } from './service'

export interface ScannerSystemOptions {
  /** 初始配置（core 经 electron-store 回注；不传 = 出厂默认） */
  initialConfig?: ScannerConfig
  /** 运行时修改持久化（core 写 userData；未注入则 setConfig 仅内存生效） */
  persist?: (config: ScannerConfig) => void
  /** 结构化日志（扫码内容会入日志，按业务合规取舍） */
  logger?: Logger
}

export interface ScannerSystem {
  /** 窗口接入：before-input-event 观察键盘（不消费，人工输入不受影响） */
  attachWindow: (win: BrowserWindow) => void
  getConfig: () => ScannerConfig
  /** 全量替换域配置（enabled/activeId/devices；入参合法性由 IPC 层 sanitize） */
  setConfig: (next: ScannerConfig) => ScannerConfig
  /** 模拟一条扫码（诊断/演示：走与真枪完全相同的缓冲 → 广播链路） */
  simulate: (code: string) => ScanResult
  destroy: () => void
}

/** 创建扫码枪系统（scanner 域通道由 core/src/ipc/scanner.ts 注册） */
export function createScannerSystem(options: ScannerSystemOptions = {}): ScannerSystem {
  const log: ScannerLogFn = (level, message, meta) => options.logger?.[level](message, meta)
  const service = new ScanService(options.initialConfig, options.persist, log)
  return {
    attachWindow: win => service.attachWindow(win),
    getConfig: () => service.getConfig(),
    setConfig: next => service.setConfig(next),
    simulate: code => service.simulate(code),
    destroy: () => service.destroy(),
  }
}
