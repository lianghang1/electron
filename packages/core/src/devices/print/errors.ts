import type { PrintError, PrintErrorCode } from '@desktop/shared'

/** 统一打印错误：所有通道/平台失败都必须收敛为该类型，禁止裸异常越过归一化层 */
export class PrintErrorImpl extends Error implements PrintError {
  readonly code: PrintErrorCode
  readonly detail?: unknown

  constructor(code: PrintErrorCode, message: string, detail?: unknown) {
    super(message)
    this.name = 'PrintError'
    this.code = code
    this.detail = detail
  }

  toJSON(): PrintError {
    return { code: this.code, message: this.message, detail: this.detail }
  }
}

export function printError(code: PrintErrorCode, message: string, detail?: unknown): PrintErrorImpl {
  return new PrintErrorImpl(code, message, detail)
}

/** 未知异常 → 统一错误（保留原始信息便于排查，不向外泄漏通道特有结构） */
export function toPrintError(err: unknown): PrintErrorImpl {
  if (err instanceof PrintErrorImpl) { return err }
  const message = err instanceof Error ? err.message : String(err)
  return new PrintErrorImpl('UNKNOWN', message, err instanceof Error ? err.stack : undefined)
}
