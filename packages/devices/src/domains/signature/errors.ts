import type { SignErrorCode } from './device-contracts'
import { HostRemoteError } from '../../host/errors'
import { DeviceError, isDeviceError } from '../../runtime/errors'

/** signature 统一错误（笔迹内容不得进入错误信息）：形状与归一逻辑共用 runtime 底座。 */
const ERROR_NAME = 'SignatureError'

export function signatureError(code: SignErrorCode, message: string, detail?: unknown): DeviceError<SignErrorCode> {
  return new DeviceError(code, message, detail, ERROR_NAME)
}

/** 未知异常 → 统一错误；守护进程边界按原 name/code/detail 还原，不丢真实错误码。 */
export function toSignatureError(err: unknown): DeviceError<SignErrorCode> {
  if (isDeviceError<SignErrorCode>(err) && err.name === ERROR_NAME) { return err }
  if (err instanceof HostRemoteError && err.name === ERROR_NAME) {
    return new DeviceError(err.code as SignErrorCode, err.message, err.detail, ERROR_NAME)
  }
  const message = err instanceof Error ? err.message : String(err)
  return new DeviceError('UNKNOWN', message, undefined, ERROR_NAME)
}
