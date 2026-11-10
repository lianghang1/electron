/**
 * 设备统一错误：六个能力域、全部通道、守护进程边界共用一种形状与一张码表。
 * 任何异常越过调用管线前都必须归一到 DeviceError，业务层只见 code/message/detail。
 */
export const DEVICE_ERROR_CODES = [
  'METHOD_NOT_FOUND',
  'INVALID_INPUT',
  'PERMISSION_DENIED',
  'DEVICE_NOT_FOUND',
  'DEVICE_UNAVAILABLE',
  'DRIVER_MISSING',
  'PLATFORM_UNSUPPORTED',
  'VENDOR_SDK_UNAVAILABLE',
  'CHANNEL_UNAVAILABLE',
  'TIMEOUT',
  'BUSY',
  'UNKNOWN',
] as const

export type DeviceErrorCode = typeof DEVICE_ERROR_CODES[number]

export interface DeviceErrorShape {
  readonly code: DeviceErrorCode
  readonly message: string
  readonly detail?: unknown
}

export class DeviceError extends Error implements DeviceErrorShape {
  readonly code: DeviceErrorCode
  readonly detail?: unknown

  constructor(code: DeviceErrorCode, message: string, detail?: unknown) {
    super(message)
    this.name = 'DeviceError'
    this.code = code
    this.detail = detail
  }

  toJSON(): DeviceErrorShape {
    return { code: this.code, message: this.message, detail: this.detail }
  }
}

export function deviceError(code: DeviceErrorCode, message: string, detail?: unknown): DeviceError {
  return new DeviceError(code, message, detail)
}

export function isDeviceError(err: unknown): err is DeviceError {
  return err instanceof DeviceError
}

/** 远端边界传来的错误只搬运 name/code/message/detail，按其原始码还原，避免丢真实原因。 */
export function toDeviceError(err: unknown, fallback: DeviceErrorCode = 'UNKNOWN'): DeviceError {
  if (isDeviceError(err)) { return err }
  if (err instanceof Error) {
    const candidate = (err as Error & { code?: unknown }).code
    const code = typeof candidate === 'string' && DEVICE_ERROR_CODES.includes(candidate as DeviceErrorCode)
      ? candidate as DeviceErrorCode
      : fallback
    return new DeviceError(code, err.message, (err as Error & { detail?: unknown }).detail)
  }
  return new DeviceError(fallback, String(err))
}
