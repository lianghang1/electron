import type { CaptureErrorCode } from '@shell/shared'
import { HostRemoteError } from '../../host/errors'
import { DeviceError, isDeviceError } from '../../runtime/errors'

/** capture 统一错误：通道失败必须收敛为 DeviceError<CaptureErrorCode>；形状与归一逻辑共用 runtime 底座。 */
const ERROR_NAME = 'CaptureError'

export function captureError(code: CaptureErrorCode, message: string, detail?: unknown): DeviceError<CaptureErrorCode> {
  return new DeviceError(code, message, detail, ERROR_NAME)
}

/** 未知异常 → 统一错误；守护进程边界按原 name/code/detail 还原，不丢真实错误码。 */
export function toCaptureError(err: unknown): DeviceError<CaptureErrorCode> {
  if (isDeviceError<CaptureErrorCode>(err) && err.name === ERROR_NAME) { return err }
  if (err instanceof HostRemoteError && err.name === ERROR_NAME) {
    return new DeviceError(err.code as CaptureErrorCode, err.message, err.detail, ERROR_NAME)
  }
  const message = err instanceof Error ? err.message : String(err)
  return new DeviceError('UNKNOWN', message, undefined, ERROR_NAME)
}
