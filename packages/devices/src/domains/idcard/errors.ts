import type { IdReaderErrorCode } from './device-contracts'
import { HostRemoteError } from '../../host/errors'
import { DeviceError, isDeviceError } from '../../runtime/errors'

/** idcard 统一错误（PII 域：错误信息不得携带证件号/照片）：形状与归一逻辑共用 runtime 底座。 */
const ERROR_NAME = 'IdCardError'

export function idCardError(code: IdReaderErrorCode, message: string, detail?: unknown): DeviceError<IdReaderErrorCode> {
  return new DeviceError(code, message, detail, ERROR_NAME)
}

/** 未知异常 → 统一错误；守护进程边界按原 name/code/detail 还原，不丢真实错误码。 */
export function toIdCardError(err: unknown): DeviceError<IdReaderErrorCode> {
  if (isDeviceError<IdReaderErrorCode>(err) && err.name === ERROR_NAME) { return err }
  if (err instanceof HostRemoteError && err.name === ERROR_NAME) {
    return new DeviceError(err.code as IdReaderErrorCode, err.message, err.detail, ERROR_NAME)
  }
  const message = err instanceof Error ? err.message : String(err)
  return new DeviceError('UNKNOWN', message, undefined, ERROR_NAME)
}
