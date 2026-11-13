import type { PermissionService } from '@shell/app-runtime'
import type { Logger } from '@shell/kernel/logger'
import type { CallerRegistry, DomainCallContext } from '@shell/shared'
import type { IpcMainInvokeEvent } from 'electron'

/** 调用者身份（CallerRegistry 登记：Main 创建窗口 / 容器时写入，渲染层无法伪造） */
export type IpcCaller = NonNullable<ReturnType<CallerRegistry['tryResolve']>>

/** 账本反查调用者：未登记即拒绝（破坏性 / 管理面通道第一行关卡的基础） */
export function callerOf(callers: CallerRegistry, senderId: number): IpcCaller {
  const caller = callers.tryResolve(senderId)
  if (!caller) { throw new Error('调用方未登记') }
  return caller
}

/** 域单通道路由上下文（domain-call / jsapi:call 共用）：身份反查 + 域日志 scope + 高频帧点对点送达 */
export function domainCallContext(
  deps: { callers: CallerRegistry, logger: Logger },
  event: IpcMainInvokeEvent,
  method: string,
  scope: string,
  unregistered: () => Error,
): DomainCallContext {
  const caller = deps.callers.tryResolve(event.sender.id)
  if (!caller) { throw unregistered() }
  return {
    appId: caller.appId,
    instanceId: caller.instanceId,
    log: message => deps.logger.scope(scope).info(message, { method, appId: caller.appId }),
    push: (name, payload) => {
      if (!event.sender.isDestroyed()) { event.sender.send(`event:${name}`, payload) }
    },
  }
}

/** 管理面授权关卡：校验 storage / notification 权限，返回调用者 appId */
export async function authorized(
  deps: { callers: CallerRegistry, permissions: PermissionService },
  senderId: number,
  permission: string,
): Promise<string> {
  const caller = callerOf(deps.callers, senderId)
  const allowed = await deps.permissions.decide({
    appId: caller.appId,
    origin: `app://${caller.appId}`,
    permission,
  })
  if (!allowed) { throw new Error(`PERMISSION_DENIED: ${permission}`) }
  return caller.appId
}
