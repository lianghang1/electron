/**
 * scanner 模块统一契约 —— 扫码枪（第四设备域：产出条码字符串）。
 * 扫码枪在 Windows 上是 HID 键盘仿真设备（无驱动无 DLL）：
 * 高速连击字符 + 结束键（默认 Enter），与真人打字的区别靠"节奏 + 长度"判定。
 */

export interface ScanResult {
  /** 完整条码（含前缀） */
  code: string
  /** 命中的前缀（如 "PB:"），未配置/未命中为 null */
  prefix: string | null
  /** 去掉前缀后的原始码 */
  rawCode: string
  timestamp: number
}

export interface ScanOptions {
  /** 无后续按键多久判定一次缓冲结束（ms），默认 100——扫码枪连击间隔远小于人打字 */
  timeout?: number
  /** 最小条码长度，默认 4（过滤误触） */
  minLength?: number
  /** 结束键，默认 Enter（多数扫码枪可配置追加回车） */
  endKey?: string
  /** 前缀列表（部分业务用前缀区分单据类型），命中后结果带 prefix */
  prefixes?: string[]
  /** 强制要求前缀命中才算有效扫码 */
  requirePrefix?: boolean
}

export interface ScannerConfig extends Required<Omit<ScanOptions, 'requirePrefix'>> {
  /** 总开关：关闭后键盘事件不再进入缓冲器（扫码枪变普通键盘） */
  enabled: boolean
  requirePrefix: boolean
}

export type ScannerLogFn = (
  level: 'info' | 'warn' | 'error',
  message: string,
  meta?: Record<string, unknown>,
) => void

export type ScanErrorCode = 'VALIDATION_FAILED' | 'UNKNOWN'
