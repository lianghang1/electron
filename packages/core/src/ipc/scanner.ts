import type { ScannerSetInput } from '@desktop/shared'
import type { ScannerSystem } from '../devices/scanner'
import { DesktopError } from '@desktop/shared'
import { is } from '@electron-toolkit/utils'
import { handle } from './handle'
import { isWsUrl } from './ws-url'

export interface ScannerIpcDeps {
  /** 扫码枪系统（bootstrap 装配，恒创建） */
  scanner: ScannerSystem
}

/**
 * scanner 域通道注册：扫码枪（键盘仿真 / HID 通道）。扫码结果为广播推送
 * （ScanService 直接 webContents.send scanner:scanReceived），这里只挂请求-响应通道。
 * 档案清单与技术字段（品牌/通道）由代码出厂预设锁死，renderer 仅提交白名单覆盖。
 */
export function registerScannerIpc(deps: ScannerIpcDeps): void {
  handle('scanner:getConfig', () => deps.scanner.getConfig())
  handle('scanner:setConfig', (_e, input) => deps.scanner.setConfig(sanitizeSetInput(input)))
  // simulate 是诊断工具，不进生产 API 面
  handle('scanner:simulate', (_e, code) => {
    if (!is.dev) {
      throw new DesktopError('PERMISSION_DENIED', 'scanner simulate is dev-only')
    }
    return deps.scanner.simulate(code)
  })
}

/** 提交入参收敛：域级开关/激活指向 + 单档案白名单覆盖；非法值直接拒绝（VALIDATION_FAILED），不静默放宽 */
function sanitizeSetInput(input: Partial<ScannerSetInput> | undefined): ScannerSetInput {
  const deviceId = typeof input?.deviceId === 'string' ? input.deviceId.trim() : ''
  if (!deviceId) {
    throw new DesktopError('VALIDATION_FAILED', '缺少待覆盖的扫码枪档案 id')
  }
  const raw = input?.overrides && typeof input.overrides === 'object' ? input.overrides : {}
  const displayName = typeof raw.displayName === 'string' ? raw.displayName.trim() : undefined
  if (displayName !== undefined && !displayName) {
    throw new DesktopError('VALIDATION_FAILED', '扫码枪名称不能为空')
  }
  const endKey = typeof raw.endKey === 'string' ? raw.endKey.trim() : undefined
  if (endKey !== undefined && !endKey) {
    throw new DesktopError('VALIDATION_FAILED', '结束键不能为空')
  }
  const hidUrl = typeof raw.hidUrl === 'string' ? raw.hidUrl.trim() : undefined
  if (hidUrl !== undefined && !isWsUrl(hidUrl)) {
    throw new DesktopError('VALIDATION_FAILED', `HID 服务地址不合法（须 ws:// 或 wss:// 前缀）: ${hidUrl}`)
  }
  const timeout = typeof raw.timeout === 'number' && Number.isFinite(raw.timeout) && raw.timeout > 0 ? raw.timeout : undefined
  const minLength = typeof raw.minLength === 'number' && Number.isInteger(raw.minLength) && raw.minLength >= 0 ? raw.minLength : undefined
  const prefixes = Array.isArray(raw.prefixes) && raw.prefixes.every(x => typeof x === 'string') ? [...raw.prefixes] : undefined
  const requirePrefix = typeof raw.requirePrefix === 'boolean' ? raw.requirePrefix : undefined
  return {
    deviceId,
    enabled: input?.enabled !== false,
    activeId: typeof input?.activeId === 'string' ? input.activeId : '',
    overrides: {
      ...(displayName ? { displayName } : {}),
      ...(timeout !== undefined ? { timeout } : {}),
      ...(minLength !== undefined ? { minLength } : {}),
      ...(endKey ? { endKey } : {}),
      ...(prefixes ? { prefixes } : {}),
      ...(requirePrefix !== undefined ? { requirePrefix } : {}),
      ...(hidUrl ? { hidUrl } : {}),
    },
  }
}
