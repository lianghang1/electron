import type { CaptureErrorCode } from '@desktop/shared'
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
  const message = err instanceof Error ? err.message : String(err)
  return new CaptureErrorImpl('UNKNOWN', message)
}
