import type { CallerContext } from '@desktop/shared'
import type { WebContents } from 'electron'
import { DesktopError } from '@desktop/shared'

/**
 * IPC 调用者身份表：webContents.id → CallerContext。
 * 身份由 Main 在创建窗口 / Web 容器时登记，Renderer 无法伪造
 * （契约参数里不携带任何身份字段）。
 */
export class CallerResolver {
  private contexts = new Map<number, CallerContext>()

  register(wc: WebContents, context: CallerContext): void {
    this.contexts.set(wc.id, context)
  }

  unregister(wc: WebContents): void {
    this.contexts.delete(wc.id)
  }

  resolve(sender: WebContents): CallerContext {
    const context = this.contexts.get(sender.id)
    if (!context)
      throw new DesktopError('IPC_ERROR', `Unidentified IPC caller: webContents ${sender.id}`)
    return context
  }

  /** 反查身份但不抛错：系统级事件（崩溃 / 控制台）可能来自未登记的 webContents（如 DevTools） */
  tryResolve(sender: WebContents): CallerContext | undefined {
    return this.contexts.get(sender.id)
  }
}
