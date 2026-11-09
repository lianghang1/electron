/**
 * 调用方身份：由主进程在窗口/视图创建时登记，渲染层无法伪造。
 * domain-call / jsapi-call / 系统权限请求三条链路统一按 appId 判定，
 * 与权限策略表同源，不再各写一份口径。
 */
export const SHELL_APP_ID = 'shell'

export type CallerKind = 'shell' | 'view' | 'overlay'

export interface CallerContext {
  readonly appId: string
  readonly instanceId: string
  readonly kind: CallerKind
}

export class CallerRegistry {
  private readonly contexts = new Map<number, CallerContext>()

  register(webContentsId: number, context: CallerContext): void {
    this.contexts.set(webContentsId, context)
  }

  unregister(webContentsId: number): void {
    this.contexts.delete(webContentsId)
  }

  resolve(webContentsId: number): CallerContext {
    const context = this.contexts.get(webContentsId)
    if (!context) { throw new Error(`调用方未登记：webContents ${webContentsId}`) }
    return context
  }

  tryResolve(webContentsId: number): CallerContext | undefined {
    return this.contexts.get(webContentsId)
  }
}

/** Chromium 权限名 → 平台权限名；未列出的权限无对应平台能力，一律拒绝 */
const CHROMIUM_PERMISSION_MAP: Readonly<Record<string, string>> = {
  'clipboard-read': 'clipboard.read',
  'clipboard-sanitized-write': 'clipboard.write',
  'notifications': 'notification',
  'media': 'media',
  'geolocation': 'geolocation',
  'fullscreen': 'fullscreen',
  'pointerLock': 'pointerLock',
  'display-capture': 'display-capture',
}

export function sessionToPlatformPermission(permission: string): string | undefined {
  return CHROMIUM_PERMISSION_MAP[permission]
}

/** 域方法未显式声明 grant 时，按所属域推导——与 buildAppPermissionRules 的 domain.<域> 规则同源 */
export function domainGrant(domain: string, declared?: string): string {
  return declared ?? `domain.${domain}`
}
