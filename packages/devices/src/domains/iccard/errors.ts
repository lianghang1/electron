import type { IcCardErrorCode } from './types'
import { HostRemoteError } from '../../host/errors'

/** iccard 统一错误（卡数据域：错误信息不得携带卡块数据/密钥）：适配器失败必须收敛为该类型 */
export class IcCardError extends Error {
  readonly code: IcCardErrorCode
  readonly detail?: unknown

  constructor(code: IcCardErrorCode, message: string, detail?: unknown) {
    super(message)
    this.name = 'IcCardError'
    this.code = code
    this.detail = detail
  }
}

export function icCardError(code: IcCardErrorCode, message: string, detail?: unknown): IcCardError {
  return new IcCardError(code, message, detail)
}

export function toIcCardError(err: unknown): IcCardError {
  if (err instanceof IcCardError) { return err }
  // 守护进程边界错误按原码/detail 还原（HostRemoteError 仅搬运远端 name/code/message/detail，不还原会丢真实错误码）
  if (err instanceof HostRemoteError && err.name === 'IcCardError') {
    return new IcCardError(err.code as IcCardErrorCode, err.message, err.detail)
  }
  const message = err instanceof Error ? err.message : String(err)
  return new IcCardError('UNKNOWN', message)
}
