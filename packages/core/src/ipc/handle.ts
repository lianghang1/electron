import type { DesktopInvoke } from '@desktop/shared'
import type { IpcMainInvokeEvent } from 'electron'
import { ipcMain } from 'electron'

/**
 * 类型安全的 ipcMain.handle 包装：
 * - channel 必须是 @desktop/shared 契约成员（invoke 子集），拼错直接编译报错
 * - handler 的入参与返回值由契约约束
 */
export function handle<K extends keyof DesktopInvoke>(
  channel: K,
  handler: (
    event: IpcMainInvokeEvent,
    ...args: Parameters<DesktopInvoke[K]>
  ) => ReturnType<DesktopInvoke[K]> | Promise<ReturnType<DesktopInvoke[K]>>,
): void {
  ipcMain.handle(channel, (event, ...args: unknown[]) =>
    (handler as (e: IpcMainInvokeEvent, ...a: unknown[]) => unknown)(event, ...args))
}
