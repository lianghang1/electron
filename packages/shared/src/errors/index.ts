/** 平台统一错误码：跨 IPC 只传 code + message + details，可序列化 */
export type DesktopErrorCode
  = | 'APP_NOT_FOUND'
    | 'APP_NOT_ALLOWED'
    | 'PERMISSION_DENIED'
    | 'TAB_NOT_FOUND'
    | 'SESSION_NOT_FOUND'
    | 'INVALID_ORIGIN'
    | 'STORAGE_ERROR'
    | 'IPC_ERROR'

/**
 * 平台统一错误。跨 IPC 传递时序列化为 { code, message, details }，
 * 不要把 Electron 原生 Error 对象直接扔过 IPC。
 */
export class DesktopError extends Error {
  readonly code: DesktopErrorCode
  readonly details?: unknown

  constructor(code: DesktopErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'DesktopError'
    this.code = code
    this.details = details
  }
}
