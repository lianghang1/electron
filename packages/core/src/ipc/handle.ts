import type { DesktopInvoke, IpcErrorPayload } from '@desktop/shared'
import type { IpcMainInvokeEvent } from 'electron'
import type { Logger } from '../logger/logger'
import { encodeIpcError } from '@desktop/shared'
import { ipcMain } from 'electron'

/** handle 层日志（runtime 装配时注入；未注入时仅做异常编码，不留痕） */
let handleLogger: Logger | undefined

/**
 * 类型安全的 ipcMain.handle 包装工厂：
 * - Ipc 为 invoke 形态的通道映射契约（type alias），channel 拼错、入参与返回值不符直接编译报错
 * - 平台与 App 共用同一套包装：core 内部用 handle，App 用 createHandle<AppIpc>()
 *
 * 崩溃防护第 1 层（IPC 异常规范化）：handler 抛出的异常在此统一出口——
 * 主进程日志留痕（排障盲区补齐）后编码为可序列化 message 再抛出，
 * 渲染层经 preload 桥 decodeIpcError 还原 code/details，业务按错误码分支。
 */
export function createHandle<Ipc extends Record<string, (...args: any[]) => any>>() {
  return function handle<K extends keyof Ipc & string>(
    channel: K,
    handler: (
      event: IpcMainInvokeEvent,
      ...args: Parameters<Ipc[K]>
    ) => ReturnType<Ipc[K]> | Promise<ReturnType<Ipc[K]>>,
  ): void {
    ipcMain.handle(channel, async (event, ...args: unknown[]) => {
      try {
        return await (handler as (e: IpcMainInvokeEvent, ...a: unknown[]) => unknown)(event, ...args)
      }
      catch (error) {
        handleLogger?.error(`ipc handler failed: ${channel}`, describeHandleError(error))
        throw serializeHandleError(error)
      }
    })
  }
}

/** 平台契约的 handle 实例：core 内部平台通道注册用 */
export const handle = createHandle<DesktopInvoke>()

/** runtime 日志根创建后挂接：IPC 异常统一进平台日志（scope: ipc） */
export function attachHandleLogger(logger: Logger): void {
  handleLogger = logger
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

/** 跨 IPC 序列化：Electron 只传递 message 字符串，code/details 编码进 message 由渲染层还原 */
function serializeHandleError(error: unknown): Error {
  const described = describeHandleError(error)
  const payload: IpcErrorPayload = {
    name: String(described.name),
    code: String(described.code),
    message: String(described.message),
    details: described.detail,
  }
  return new Error(encodeIpcError(payload))
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
