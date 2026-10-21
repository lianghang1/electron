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
    | 'VALIDATION_FAILED'

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

/** ipcMain.handle 抛出的错误只保留 message 字符串（code/details 丢失）：序列化进 message 跨进程还原 */
const IPC_ERROR_PREFIX = '__desktop_error__:'

/** 跨 IPC 错误载荷：code 用字符串承载各域错误码体系（平台码/设备码），details 须可结构化克隆 */
export interface IpcErrorPayload {
  /** 主进程错误类名（DesktopError / IdCardError…），渲染层用于识别错误种类 */
  name: string
  code: string
  message: string
  details?: unknown
}

/** 主进程侧：把带 code 的错误编码为可穿越 IPC 的 message（异常经 createHandle 统一走此出口） */
export function encodeIpcError(payload: IpcErrorPayload): string {
  return IPC_ERROR_PREFIX + JSON.stringify(payload)
}

/**
 * 渲染层侧：从 invoke 拒绝的错误里还原主进程错误码。
 * Electron 会把主进程抛的 Error 包装为 "Error invoking remote method '<channel>': <message>"，
 * 因此按前缀索引提取而非严格匹配开头；非平台序列化错误原样返回 null（调用方保留原始错误）。
 */
export function decodeIpcError(error: unknown): IpcErrorPayload | null {
  const message = error instanceof Error ? error.message : ''
  const start = message.indexOf(IPC_ERROR_PREFIX)
  if (start < 0) {
    return null
  }
  try {
    const payload = JSON.parse(message.slice(start + IPC_ERROR_PREFIX.length)) as IpcErrorPayload
    return payload.code && payload.message ? payload : null
  }
  catch {
    return null
  }
}

/** 渲染层侧还原出的远端错误：保留 code/details 供业务按错误码分支（与主进程错误类同构） */
export class IpcRemoteError extends Error {
  readonly code: string
  readonly details?: unknown

  constructor(payload: IpcErrorPayload) {
    super(payload.message)
    this.name = payload.name
    this.code = payload.code
    this.details = payload.details
  }
}
