import type { DesktopInvoke } from '@desktop/shared'
import type { IpcMainInvokeEvent } from 'electron'
import { ipcMain } from 'electron'

/**
 * 类型安全的 ipcMain.handle 包装工厂：
 * - Ipc 为 invoke 形态的通道映射契约（type alias），channel 拼错、入参与返回值不符直接编译报错
 * - 平台与 App 共用同一套包装：core 内部用 handle，App 用 createHandle<AppIpc>()
 */
export function createHandle<Ipc extends Record<string, (...args: any[]) => any>>() {
  return function handle<K extends keyof Ipc & string>(
    channel: K,
    handler: (
      event: IpcMainInvokeEvent,
      ...args: Parameters<Ipc[K]>
    ) => ReturnType<Ipc[K]> | Promise<ReturnType<Ipc[K]>>,
  ): void {
    ipcMain.handle(channel, (event, ...args: unknown[]) =>
      (handler as (e: IpcMainInvokeEvent, ...a: unknown[]) => unknown)(event, ...args))
  }
}

/** 平台契约的 handle 实例：core 内部平台通道注册用 */
export const handle = createHandle<DesktopInvoke>()
