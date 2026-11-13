import type { InvokeSig, IpcDefs, IpcDomainValue, SendSig, ShellDomainValue, ShellIpc, ShellSendIpc, SigOf } from '@shell/shared/ipc'
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron'
import { encodeIpcError } from '@shell/shared/ipc'
import { ipcMain } from 'electron'

/**
 * 主进程侧类型化注册包装（与 packages/shared ipc 契约同源）：
 * - shellHandle：invoke 通道 → ipcMain.handle，异常在此统一出口——
 *   编码为可序列化 message 再抛出（渲染层经 preload 桥 decodeIpcError 还原 code/details）。
 * - shellOn：send 通道 → ipcMain.on，单向无回执。
 * 通道键与 handler 签名全部由契约推导：通道拼错、入参与返回值不符直接编译报错。
 * 调用者身份与越权校验由各域 handler 自理（CallerResolver 反查 + 身份关卡）。
 */

/** handle 层日志（runtime 装配后注入；未注入时仅做异常编码，不留痕） */
let handleLogger: { debug: (message: string, fields?: Record<string, unknown>) => void, error: (message: string, fields?: Record<string, unknown>) => void } | undefined

/** 域类型化错误识别：错误对象自带 code 契约且非裸 Error（Node 系统错误如 ENOENT 仍按未知异常兜底） */
function isDomainError(error: unknown): boolean {
  const carrier = error as { name?: unknown, code?: unknown } | null
  return typeof carrier?.code === 'string' && carrier.name !== 'Error'
}

/** 日志元数据：错误类名 + 错误码 + 消息 + 可序列化 detail（不进日志的敏感内容由各域自行保证） */
function describeHandleError(error: unknown): Record<string, unknown> {
  const carrier = error as { name?: unknown, code?: unknown, message?: unknown, details?: unknown, detail?: unknown } | null
  const detail = carrier?.details !== undefined ? carrier.details : carrier?.detail
  return {
    name: typeof carrier?.name === 'string' ? carrier.name : typeof error,
    code: typeof carrier?.code === 'string' ? carrier.code : 'UNKNOWN',
    message: typeof carrier?.message === 'string' ? carrier.message : String(error),
    detail: detail === undefined ? undefined : safeCloneDetail(detail),
  }
}

/** detail 须可结构化克隆：JSON 往返兜底（丢函数/原型），循环引用等失败降级为字符串留痕 */
function safeCloneDetail(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value))
  }
  catch {
    return String(value)
  }
}

/** 跨 IPC 序列化（入参为 describeHandleError 产物）：Electron 只传递 message 字符串，code/details 编码进 message 由渲染层还原 */
function serializeHandleError(described: Record<string, unknown>): Error {
  return new Error(encodeIpcError({
    name: String(described.name),
    code: String(described.code),
    message: String(described.message),
    details: described.detail,
  }))
}

/** runtime 日志根创建后挂接：IPC 异常统一进平台日志 */
export function attachShellHandleLogger(logger: typeof handleLogger): void {
  handleLogger = logger
}

/**
 * invoke 通道注册：channel 键 ∈ ShellIpc（send/push 通道不在其列，拼错即编译报错）。
 * 分级留痕：域类型化错误（自带 code 契约）为预期业务失败，降为 debug（生产不落盘）
 * 防同一失败双份 error；无 code 契约的未知异常保持 error 兜底。
 */
export function shellHandle<K extends keyof ShellIpc & string>(
  channel: K,
  handler: (event: IpcMainInvokeEvent, ...args: Parameters<ShellIpc[K]>) => ReturnType<ShellIpc[K]> | Promise<ReturnType<ShellIpc[K]>>,
): void {
  registerInvokeChannel(channel, (event, args) => handler(event, ...(args as Parameters<ShellIpc[K]>)))
}

/** send 通道注册：channel 键 ∈ ShellSendIpc（参数元组展开，单向无回执） */
export function shellOn<K extends keyof ShellSendIpc & string>(
  channel: K,
  handler: (event: IpcMainEvent, ...args: ShellSendIpc[K]) => void,
): void {
  registerSendChannel(channel, (event, args) => handler(event, ...(args as ShellSendIpc[K])))
}

/** invoke 通道运行时接线（ipcMain.handle）：异常统一出口，shellHandle 与域级注册共用 */
function registerInvokeChannel(channel: string, handler: (event: IpcMainInvokeEvent, args: unknown[]) => unknown): void {
  ipcMain.handle(channel, async (event, ...args: unknown[]) => {
    try {
      return await handler(event, args)
    }
    catch (error) {
      const described = describeHandleError(error)
      if (isDomainError(error)) {
        handleLogger?.debug(`ipc handler failed: ${channel}`, described)
      }
      else {
        handleLogger?.error(`ipc handler failed: ${channel}`, described)
      }
      throw serializeHandleError(described)
    }
  })
}

/** send 通道运行时接线（ipcMain.on）：单向无回执，shellOn 与域级注册共用 */
function registerSendChannel(channel: string, handler: (event: IpcMainEvent, args: unknown[]) => void): void {
  ipcMain.on(channel, (event, ...args: unknown[]) => {
    handler(event, args)
  })
}

/** invoke 契约签名 → handler 签名（event 前插，返回值可同步可异步） */
export type IpcInvokeHandler<S> = S extends (...args: infer A) => infer R
  ? (event: IpcMainInvokeEvent, ...args: A) => R | Promise<R>
  : never

/** send 契约签名 → handler 签名（event 前插，单向无回执） */
export type IpcSendHandler<S> = S extends (...args: infer A) => unknown
  ? (event: IpcMainEvent, ...args: A) => void
  : never

/**
 * 域 handler 表：方法名 → handler，键集与签名由域契约推导——
 * 契约声明的方法缺 handler、契约外多写 handler 都是调用点编译错误；
 * push 通道主进程只发不收（webContents.send 方向），不在表内。
 */
export type IpcDomainHandlers<V extends IpcDomainValue<string, IpcDefs>> = {
  [K in keyof V['defs'] & string as V['defs'][K] extends InvokeSig<any> ? K : never]: IpcInvokeHandler<SigOf<V['defs'][K]>>
} & {
  [K in keyof V['defs'] & string as V['defs'][K] extends SendSig<any> ? K : never]: IpcSendHandler<SigOf<V['defs'][K]>>
}

/** 契约外的弱化转发形态：键与签名已由 IpcDomainHandlers 在调用点按契约校验，此处仅做运行时绑定 */
type AnyInvokeHandler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown
type AnySendHandler = (event: IpcMainEvent, ...args: unknown[]) => void

/**
 * 域级表驱动注册：遍历 defineIpcDomain 运行时通道表接线——通道名与 handler 签名
 * 全部由契约推导，主进程侧零通道字面量（渲染层 preload 表驱动生成的对偶面）。
 * 域级注册让「契约声明了但漏注册」从静态正则检查变成调用点编译错误。
 */
export function registerIpcDomain<V extends ShellDomainValue>(domain: V, handlers: IpcDomainHandlers<V>): void {
  const table = handlers as Record<string, AnyInvokeHandler | AnySendHandler>
  for (const [method, channel] of Object.entries(domain.invokeChannels)) {
    registerInvokeChannel(channel, (event, args) => (table[method] as AnyInvokeHandler)(event, ...args))
  }
  for (const [method, channel] of Object.entries(domain.sendChannels)) {
    registerSendChannel(channel, (event, args) => (table[method] as AnySendHandler)(event, ...args))
  }
}
