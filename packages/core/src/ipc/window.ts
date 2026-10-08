import type { IpcMainInvokeEvent } from 'electron'
import { app, BrowserWindow } from 'electron'
import { handle } from './handle'

const winFrom = (event: IpcMainInvokeEvent) => BrowserWindow.fromWebContents(event.sender)

/**
 * 窗口域通道注册：始终操作调用来源的窗口。
 * 与其他域不同，这里无需身份表——event.sender 即调用窗口，无外部依赖。
 */
export function registerWindowIpc(): void {
  handle('window:minimize', e => winFrom(e)?.minimize())
  handle('window:maximize', e => winFrom(e)?.maximize())
  handle('window:restore', e => winFrom(e)?.unmaximize())
  handle('window:isMaximized', e => winFrom(e)?.isMaximized() ?? false)
  handle('window:close', e => winFrom(e)?.close())
  // 走 app.quit()（before-quit → quitting 标记），exitGuard 只拦窗口 close，不会拦退出流程
  handle('window:quit', () => app.quit())
}
