import type { SignErrorCode } from './types'
import { HostRemoteError } from '../../host/errors'

/** signature 统一错误：适配器失败必须收敛为该类型（笔迹内容不得进入错误信息） */
export class SignatureError extends Error {
  readonly code: SignErrorCode
  readonly detail?: unknown

  constructor(code: SignErrorCode, message: string, detail?: unknown) {
    super(message)
    this.name = 'SignatureError'
    this.code = code
    this.detail = detail
  }
}

export function signatureError(code: SignErrorCode, message: string, detail?: unknown): SignatureError {
  return new SignatureError(code, message, detail)
}

export function toSignatureError(err: unknown): SignatureError {
  if (err instanceof SignatureError) { return err }
  // 守护进程边界错误按原码/detail 还原（HostRemoteError 仅搬运远端 name/code/message/detail，不还原会丢真实错误码）
  if (err instanceof HostRemoteError && err.name === 'SignatureError') {
    return new SignatureError(err.code as SignErrorCode, err.message, err.detail)
  }
  const message = err instanceof Error ? err.message : String(err)
  return new SignatureError('UNKNOWN', message)
}
