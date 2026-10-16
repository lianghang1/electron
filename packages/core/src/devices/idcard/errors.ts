import type { IdReaderErrorCode } from './types'

/** idcard 统一错误（PII 域：错误信息不得携带证件号/照片）：适配器失败必须收敛为该类型 */
export class IdCardError extends Error {
  readonly code: IdReaderErrorCode
  readonly detail?: unknown

  constructor(code: IdReaderErrorCode, message: string, detail?: unknown) {
    super(message)
    this.name = 'IdCardError'
    this.code = code
    this.detail = detail
  }
}

export function idCardError(code: IdReaderErrorCode, message: string, detail?: unknown): IdCardError {
  return new IdCardError(code, message, detail)
}

export function toIdCardError(err: unknown): IdCardError {
  if (err instanceof IdCardError) { return err }
  const message = err instanceof Error ? err.message : String(err)
  return new IdCardError('UNKNOWN', message)
}
