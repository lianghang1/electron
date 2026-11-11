import type { IcCardErrorCode } from './device-contracts'
import { HostRemoteError } from '../../host/errors'
import { DeviceError, isDeviceError } from '../../runtime/errors'

/** iccard 统一错误（卡数据域：错误信息不得携带卡块数据/密钥）：形状与归一逻辑共用 runtime 底座。 */
const ERROR_NAME = 'IcCardError'

export function icCardError(code: IcCardErrorCode, message: string, detail?: unknown): DeviceError<IcCardErrorCode> {
  return new DeviceError(code, message, detail, ERROR_NAME)
}

/** 未知异常 → 统一错误；守护进程边界按原 name/code/detail 还原，不丢真实错误码。 */
export function toIcCardError(err: unknown): DeviceError<IcCardErrorCode> {
  if (isDeviceError<IcCardErrorCode>(err) && err.name === ERROR_NAME) { return err }
  if (err instanceof HostRemoteError && err.name === ERROR_NAME) {
    return new DeviceError(err.code as IcCardErrorCode, err.message, err.detail, ERROR_NAME)
  }
  const message = err instanceof Error ? err.message : String(err)
  return new DeviceError('UNKNOWN', message, undefined, ERROR_NAME)
}
