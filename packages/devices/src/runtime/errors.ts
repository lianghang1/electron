/**
 * 设备统一错误：各能力域、全部通道、守护进程边界共用一种形状与一张码表。
 * 泛型参数 C 允许各能力域保留自己的细粒度错误码（对外契约），同时共享
 * name/code/detail/toJSON 与归一逻辑；默认码表为平台统一的 DeviceErrorCode。
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

export interface DeviceErrorShape<C extends string = DeviceErrorCode> {
  readonly code: C
  readonly message: string
  readonly detail?: unknown
}

export class DeviceError<C extends string = DeviceErrorCode> extends Error implements DeviceErrorShape<C> {
  readonly code: C
  readonly detail?: unknown

  constructor(code: C, message: string, detail?: unknown, name = 'DeviceError') {
    super(message)
    this.name = name
    this.code = code
    this.detail = detail
  }

  toJSON(): DeviceErrorShape<C> {
    return { code: this.code, message: this.message, detail: this.detail }
  }
}

export function deviceError<C extends string = DeviceErrorCode>(
  code: C,
  message: string,
  detail?: unknown,
  name?: string,
): DeviceError<C> {
  return new DeviceError(code, message, detail, name)
}

export function isDeviceError<C extends string = DeviceErrorCode>(err: unknown): err is DeviceError<C> {
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
