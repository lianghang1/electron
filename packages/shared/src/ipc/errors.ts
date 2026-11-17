/**
 * IPC 异常规范化：主进程 shellHandle 统一出口与渲染层还原。
 *
 * ipcMain.handle 抛出的异常跨 IPC 只保留 message 字符串（code/details 丢失）——
 * 主进程侧把 { name, code, message, details } 编码进 message，渲染层侧还原为
 * IpcRemoteError（业务可按错误码分支）。非平台编码的错误原样透传。
 */

/** ipcMain.handle 抛出的错误只保留 message 字符串：编码前缀用于跨进程识别 */
const IPC_ERROR_PREFIX = '__shell_ipc__:'

/** 跨 IPC 错误载荷：code 用字符串承载各域错误码体系（平台码/设备码），details 须可结构化克隆 */
export interface IpcErrorPayload {
  /** 主进程错误类名（DomainRouteError / DeviceError…），渲染层用于识别错误种类 */
  name: string
  code: string
  message: string
  details?: unknown
}

/** 主进程侧：把带 code 的错误编码为可穿越 IPC 的 message（异常经 shellHandle 统一走此出口） */
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
  if (start < 0) { return null }
  try {
    const payload = JSON.parse(message.slice(start + IPC_ERROR_PREFIX.length)) as IpcErrorPayload
    return payload.code && payload.message ? payload : null
  }
  catch {
    return null
  }
}

/** 渲染层侧还原出的远端错误：保留 code/details 供业务按错误码分支（message 与主进程一致） */
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

/**
 * invoke 信封：preload 不抛远程错误而以信封返回，由 client 在主世界解包重建
 * IpcRemoteError。原因：contextBridge 会把 preload 隔离世界抛出的 Error 克隆为
 * 裸 Error（code/details/name 全部剥离），信封是 plain object 可完整穿越沙箱桥。
 */
export type IpcInvokeEnvelope<T = unknown> = { ok: true, value: T } | { ok: false, error: IpcErrorPayload }
