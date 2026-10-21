import type { ScannerConfig, ScannerDeviceConfig } from '@desktop/shared'
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
 * scanner 域通道注册：扫码枪（键盘仿真）。扫码结果为广播推送
 * （ScanService 直接 webContents.send scanner:scanReceived），这里只挂请求-响应通道。
 */
export function registerScannerIpc(deps: ScannerIpcDeps): void {
  handle('scanner:getConfig', () => deps.scanner.getConfig())
  handle('scanner:setConfig', (_e, next) => deps.scanner.setConfig(sanitizeConfig(next)))
  // simulate 是诊断工具，不进生产 API 面
  handle('scanner:simulate', (_e, code) => {
    if (!is.dev) {
      throw new DesktopError('PERMISSION_DENIED', 'scanner simulate is dev-only')
    }
    return deps.scanner.simulate(code)
  })
}

/** 节奏参数缺省（非法值回落，与 service 出厂一致） */
const PACE_FALLBACK = { timeout: 100, minLength: 4, endKey: 'Enter', prefixes: [] as string[], requirePrefix: false }

/** 档案入参收敛：整条保存语义，必填缺失/类型不符直接拒绝（VALIDATION_FAILED），避免落库残缺档案 */
function sanitizeConfig(input: Partial<ScannerConfig> | undefined): ScannerConfig {
  const devices = Array.isArray(input?.devices) ? input!.devices.map(sanitizeDevice) : []
  if (devices.length === 0) {
    throw new DesktopError('VALIDATION_FAILED', '扫码枪档案列表不能为空')
  }
  const activeId = devices.some(d => d.id === input?.activeId) ? String(input!.activeId) : devices[0].id
  return { enabled: input?.enabled !== false, activeId, devices }
}

function sanitizeDevice(raw: unknown): ScannerDeviceConfig {
  const input = (raw ?? {}) as Partial<ScannerDeviceConfig>
  const id = typeof input.id === 'string' ? input.id.trim() : ''
  if (!id) {
    throw new DesktopError('VALIDATION_FAILED', '扫码枪档案缺少 id')
  }
  const displayName = typeof input.displayName === 'string' ? input.displayName.trim() : ''
  if (!displayName) {
    throw new DesktopError('VALIDATION_FAILED', '扫码枪名称不能为空')
  }
  if (input.transport !== 'keyboard' && input.transport !== 'hid') {
    throw new DesktopError('VALIDATION_FAILED', `不支持的接入通道: ${String(input.transport)}`)
  }
  const hidUrl = typeof input.hidUrl === 'string' ? input.hidUrl.trim() : ''
  if (input.transport === 'hid' && !isWsUrl(hidUrl)) {
    throw new DesktopError('VALIDATION_FAILED', `HID 服务地址不合法（须 ws:// 或 wss:// 前缀）: ${hidUrl}`)
  }
  return {
    id,
    displayName,
    brand: typeof input.brand === 'string' && input.brand.trim() ? input.brand.trim() : '通用',
    transport: input.transport,
    timeout: paceNumber(input.timeout, PACE_FALLBACK.timeout, false),
    minLength: paceNumber(input.minLength, PACE_FALLBACK.minLength, true),
    endKey: typeof input.endKey === 'string' && input.endKey.length > 0 ? input.endKey : PACE_FALLBACK.endKey,
    prefixes: Array.isArray(input.prefixes) && input.prefixes.every(item => typeof item === 'string')
      ? input.prefixes
      : [...PACE_FALLBACK.prefixes],
    requirePrefix: typeof input.requirePrefix === 'boolean' ? input.requirePrefix : PACE_FALLBACK.requirePrefix,
    ...(input.transport === 'hid' ? { hidUrl } : {}),
  }
}

function paceNumber(value: unknown, fallback: number, integer: boolean): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fallback
  }
  return integer ? Math.floor(value) : value
}
