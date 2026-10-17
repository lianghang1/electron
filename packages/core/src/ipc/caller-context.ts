import type { CallerContext } from '@desktop/shared'
import type { WebContents } from 'electron'
import { DesktopError } from '@desktop/shared'
import { SHELL_APP_ID } from '../constants'

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

  /** 按 id 注销：closed 回调触发时窗口已销毁，不可再访问 webContents，须存活期捕获 id 传入 */
  unregister(id: number): void {
    this.contexts.delete(id)
  }

  resolve(sender: WebContents): CallerContext {
    const context = this.contexts.get(sender.id)
    if (!context) { throw new DesktopError('IPC_ERROR', `Unidentified IPC caller: webContents ${sender.id}`) }
    return context
  }

  /** 反查身份但不抛错：系统级事件（崩溃 / 控制台）可能来自未登记的 webContents（如 DevTools） */
  tryResolve(sender: WebContents): CallerContext | undefined {
    return this.contexts.get(sender.id)
  }
}

/** Shell 专属通道的身份关卡 */
export function assertShell(context: CallerContext): void {
  if (context.appId !== SHELL_APP_ID) {
    throw new DesktopError('PERMISSION_DENIED', 'This channel is shell-only', {
      appId: context.appId,
    })
  }
}

/**
 * 域归属关卡：调用者须挂载了该域（Shell 全量恒过）。
 * 与 preload 的 --desktop-domains 挂载清单同源，preload 收口之外的主进程兜底。
 */
export function assertDomain(context: CallerContext, domain: string): void {
  const allowed = context.domains
  if (allowed === '*' || allowed.includes(domain)) { return }
  throw new DesktopError('PERMISSION_DENIED', `Domain not mounted: ${domain}`, {
    appId: context.appId,
    // '*' 分支已在上方 return：此处 allowed 必为清单
    domains: allowed.join(','),
  })
}
