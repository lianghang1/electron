import type { ScannerConfig } from '@desktop/shared'
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
 * （ScanService 直接 webContents.send scanner:scanReceived），这里只挂请求-响应通道。
 */
export function registerScannerIpc(deps: ScannerIpcDeps): void {
  handle('scanner:getConfig', () => deps.scanner.getConfig())
  handle('scanner:setConfig', (_e, patch) => deps.scanner.setConfig(sanitizeConfigPatch(patch)))
  // simulate 是诊断工具，不进生产 API 面
  handle('scanner:simulate', (_e, code) => {
    if (!is.dev) {
      throw new DesktopError('PERMISSION_DENIED', 'scanner simulate is dev-only')
    }
    return deps.scanner.simulate(code)
  })
}

/** 配置补丁入参收敛：仅接受已知字段且类型正确，非法值丢弃（不污染持久化 store） */
function sanitizeConfigPatch(patch: Partial<ScannerConfig> | undefined): Partial<ScannerConfig> {
  const input = patch ?? {}
  const out: Partial<ScannerConfig> = {}
  if (typeof input.enabled === 'boolean') { out.enabled = input.enabled }
  if (typeof input.timeout === 'number' && Number.isFinite(input.timeout) && input.timeout > 0) { out.timeout = input.timeout }
  if (typeof input.minLength === 'number' && Number.isInteger(input.minLength) && input.minLength >= 0) { out.minLength = input.minLength }
  if (typeof input.endKey === 'string' && input.endKey.length > 0) { out.endKey = input.endKey }
  if (Array.isArray(input.prefixes) && input.prefixes.every(item => typeof item === 'string')) { out.prefixes = input.prefixes }
  if (typeof input.requirePrefix === 'boolean') { out.requirePrefix = input.requirePrefix }
  return out
}
