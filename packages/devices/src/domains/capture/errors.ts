import type { CaptureErrorCode } from '@shell/shared'
import { HostRemoteError } from '../host/errors'

/** capture 统一错误：适配器失败必须收敛为该类型 */
export class CaptureErrorImpl extends Error {
  readonly code: CaptureErrorCode
  readonly detail?: unknown

  constructor(code: CaptureErrorCode, message: string, detail?: unknown) {
    super(message)
    this.name = 'CaptureError'
    this.code = code
    this.detail = detail
  }
}

export function captureError(code: CaptureErrorCode, message: string, detail?: unknown): CaptureErrorImpl {
  return new CaptureErrorImpl(code, message, detail)
}

export function toCaptureError(err: unknown): CaptureErrorImpl {
  if (err instanceof CaptureErrorImpl) { return err }
  // 守护进程边界错误按原码/detail 还原（HostRemoteError 仅搬运远端 name/code/message/detail，不还原会丢真实错误码）
  if (err instanceof HostRemoteError && err.name === 'CaptureError') {
    return new CaptureErrorImpl(err.code as CaptureErrorCode, err.message, err.detail)
  }
  const message = err instanceof Error ? err.message : String(err)
  return new CaptureErrorImpl('UNKNOWN', message)
}
