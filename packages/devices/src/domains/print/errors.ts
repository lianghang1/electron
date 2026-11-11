import type { PrintErrorCode } from '@shell/shared'
import { HostRemoteError } from '../../host/errors'
import { DeviceError, isDeviceError } from '../../runtime/errors'

/** 统一打印错误：所有通道/平台失败都必须收敛为 DeviceError<PrintErrorCode>；形状与归一逻辑共用 runtime 底座。 */
const ERROR_NAME = 'PrintError'

export function printError(code: PrintErrorCode, message: string, detail?: unknown): DeviceError<PrintErrorCode> {
  return new DeviceError(code, message, detail, ERROR_NAME)
}

/** 未知异常 → 统一错误；守护进程边界按原 name/code/detail 还原，不丢真实错误码。 */
export function toPrintError(err: unknown): DeviceError<PrintErrorCode> {
  if (isDeviceError<PrintErrorCode>(err) && err.name === ERROR_NAME) { return err }
  if (err instanceof HostRemoteError && err.name === ERROR_NAME) {
    return new DeviceError(err.code as PrintErrorCode, err.message, err.detail, ERROR_NAME)
  }
  const message = err instanceof Error ? err.message : String(err)
  return new DeviceError('UNKNOWN', message, err instanceof Error ? err.stack : undefined, ERROR_NAME)
}
