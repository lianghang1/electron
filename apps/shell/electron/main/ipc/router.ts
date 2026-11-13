import type { AppService } from '@shell/app-runtime'
import type { DomainRouter } from '@shell/devices'
import type { Logger } from '@shell/kernel/logger'
import type { CallerRegistry } from '@shell/shared'
import { DomainRouteError } from '@shell/devices'
import { matchesOrigin } from '@shell/shared'
import { ipcMain } from 'electron'
import { domainCallContext } from './caller'

export interface RouterIpcDeps {
  callers: CallerRegistry
  logger: Logger
  router: DomainRouter
  apps: AppService
}

/**
 * 基础设施单通道（guard IPC_REGISTRATION_ALLOW 白名单）：设备域 zod 路由与 JSAPI 受控桥
 * 不走契约域包装，保留各自错误语义。路由上下文（身份反查 + 域日志 + 帧推送）两通道共用。
 */
export function registerRouterIpc(deps: RouterIpcDeps): void {
  // 设备域通用调用端：域级放行交给路由层授权闸门，不在桥里另写 devices 判定
  ipcMain.handle('domain-call', (event, method: string, input: unknown) => {
    const ctx = domainCallContext(deps, event, method, 'domain', () => new DomainRouteError('PERMISSION_DENIED', '调用方未登记'))
    return deps.router.call(method, input, ctx).catch((err: unknown) => {
      const code = err instanceof DomainRouteError ? err.code : 'DOMAIN_ERROR'
      deps.logger.warn('domain call failed', { method, code, err })
      // 错误码编进 message：IPC 边界只可靠保留 Error.message，调试台据此展示结构化原因
      throw new Error(`[${code}] ${err instanceof Error ? err.message : String(err)}`)
    })
  })

  // JSAPI 受控桥（remote 页面）：账本身份 + origin 白名单双重校验
  ipcMain.handle('jsapi:call', (event, method: string, input: unknown) => {
    const frameUrl = event.senderFrame?.url ?? ''
    let origin: string
    try {
      origin = new URL(frameUrl).origin
    }
    catch {
      throw new DomainRouteError('METHOD_NOT_FOUND', '无法解析调用方 origin')
    }
    const caller = deps.callers.tryResolve(event.sender.id)
    if (!caller) { throw new DomainRouteError('PERMISSION_DENIED', '调用方未登记') }
    const found = deps.apps.list().find((r) => {
      const entry = r.manifest.entry
      return r.manifest.id === caller.appId
        && entry.kind === 'remote'
        && matchesOrigin(frameUrl, entry.origins)
    })
    if (!found) {
      deps.logger.warn('jsapi rejected: origin not allowed', { origin, appId: caller.appId, method })
      throw new DomainRouteError('METHOD_NOT_FOUND', 'origin 未授权')
    }
    const ctx = domainCallContext(deps, event, method, 'jsapi', () => new DomainRouteError('PERMISSION_DENIED', '调用方未登记'))
    return deps.router.call(method, input, ctx).catch((err: unknown) => {
      deps.logger.warn('jsapi call failed', { method, appId: caller.appId, err })
      throw err
    })
  })
}
