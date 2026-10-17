import type { ScannerSystem } from '../devices/scanner'
import { DesktopError } from '@desktop/shared'
import { is } from '@electron-toolkit/utils'
import { handle } from './handle'

export interface ScannerIpcDeps {
  /** 扫码枪系统（bootstrap 装配，恒创建） */
  scanner: ScannerSystem
}

/**
 * scanner 域通道注册：扫码枪（键盘仿真）。扫码结果为广播推送
 * （ScanService 直接 webContents.send scanner:onScan），这里只挂请求-响应通道。
 */
export function registerScannerIpc(deps: ScannerIpcDeps): void {
  handle('scanner:getConfig', () => deps.scanner.getConfig())
  handle('scanner:setConfig', (_e, patch) => deps.scanner.setConfig(patch))
  // simulate 是诊断工具，不进生产 API 面
  handle('scanner:simulate', (_e, code) => {
    if (!is.dev) {
      throw new DesktopError('PERMISSION_DENIED', 'scanner simulate is dev-only')
    }
    return deps.scanner.simulate(code)
  })
}
