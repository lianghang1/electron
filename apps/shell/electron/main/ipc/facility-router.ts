import type { AppService, PermissionService } from '@shell/app-runtime'
import type { EventBus, NotificationCenter } from '@shell/kernel'
import type { DownloadManager } from '@shell/kernel/download'
import type { CallerRegistry, DomainCallContext } from '@shell/shared'
import type { UpdateCenter } from '@shell/update'
import { PlatformError } from '@shell/shared'
import { APP_EVENT_WHITELIST } from '@shell/shared/events'
import { webContents } from 'electron'
import { z } from 'zod'

/**
 * 壳设施受控出口：应用页经 JSAPI 可触达的平台能力（应用页签 / 通知 / 下载 / 更新）。
 * 与设备域同构——方法键、zod 输入校验、权限闸门三件套；权限按 manifest.permissions
 * 声明 + PermissionService 判定，未声明即拒。
 */

type FacilityHandler = (input: any, ctx: DomainCallContext, deps: FacilityDeps) => Promise<unknown> | unknown

interface FacilityRoute {
  /** 权限名：与应用 manifest.permissions 声明及 PermissionService 策略键同源 */
  permission: string
  input: z.ZodTypeAny
  handler: FacilityHandler
}

const noInput = z.object({}).passthrough()

export interface FacilityDeps {
  callers: CallerRegistry
  events: EventBus
  apps: AppService
  permissions: PermissionService
  notifications: NotificationCenter
  downloads: DownloadManager
  update?: UpdateCenter
}

const FACILITY_ROUTES = {
  app: {
    list: {
      permission: 'info',
      input: noInput,
      handler: (_input: unknown, _ctx: DomainCallContext, deps: FacilityDeps) =>
        deps.apps.list().map(r => ({
          id: r.manifest.id,
          name: r.manifest.name,
          version: r.manifest.version,
          kind: r.manifest.entry.kind,
        })),
    },
    getCurrent: {
      permission: 'info',
      input: noInput,
      handler: (_input: unknown, ctx: DomainCallContext) =>
        ({ appId: ctx.appId, appName: ctx.appName ?? ctx.appId, instanceId: ctx.instanceId }),
    },
    getManifest: {
      permission: 'info',
      input: noInput,
      handler: (_input: unknown, ctx: DomainCallContext, deps: FacilityDeps) => {
        const record = deps.apps.list().find(r => r.manifest.id === ctx.appId)
        if (!record) {
          throw new PlatformError('APP_NOT_FOUND', `应用清单不存在：${ctx.appId}`)
        }
        return record.manifest
      },
    },
    open: {
      permission: 'tabs',
      input: z.object({ appId: z.string().min(1) }).passthrough(),
      handler: async (input: { appId: string }, _ctx: DomainCallContext, deps: FacilityDeps) => {
        const instance = await deps.apps.open(input.appId)
        return { appId: instance.appId, instanceId: instance.instanceId }
      },
    },
  },
  notification: {
    show: {
      permission: 'notification',
      input: z.object({
        title: z.string().min(1),
        body: z.string().optional(),
        level: z.enum(['info', 'success', 'warning', 'error']).optional(),
        ttlMs: z.number().int().min(1000).optional(),
      }).passthrough(),
      handler: (
        input: { title: string, body?: string, level?: 'info' | 'success' | 'warning' | 'error', ttlMs?: number },
        ctx: DomainCallContext,
        deps: FacilityDeps,
      ) => {
        // toast 顶行展示来源应用名（master toast appName 语义），平台内找不到时回退 appId
        const appName = deps.apps.list().find(r => r.manifest.id === ctx.appId)?.manifest.name ?? ctx.appId
        return { id: deps.notifications.push({ ...input, appName }) }
      },
    },
    list: {
      permission: 'notification',
      input: noInput,
      handler: (_input: unknown, _ctx: DomainCallContext, deps: FacilityDeps) => deps.notifications.list(),
    },
    dismiss: {
      permission: 'notification',
      input: z.object({ id: z.string().min(1) }).passthrough(),
      handler: (input: { id: string }, _ctx: DomainCallContext, deps: FacilityDeps) => {
        deps.notifications.dismiss(input.id)
        return {}
      },
    },
  },
  download: {
    list: {
      permission: 'downloads',
      input: noInput,
      handler: (_input: unknown, _ctx: DomainCallContext, deps: FacilityDeps) => deps.downloads.list(),
    },
    // 任务动作只按 taskId 间接寻址（master 下载横幅 打开/文件夹/取消/关闭 的等位出口）
    open: {
      permission: 'downloads',
      input: z.object({ taskId: z.string().min(1) }).passthrough(),
      handler: async (input: { taskId: string }, _ctx: DomainCallContext, deps: FacilityDeps) => {
        await deps.downloads.open(input.taskId)
        return {}
      },
    },
    reveal: {
      permission: 'downloads',
      input: z.object({ taskId: z.string().min(1) }).passthrough(),
      handler: async (input: { taskId: string }, _ctx: DomainCallContext, deps: FacilityDeps) => {
        await deps.downloads.reveal(input.taskId)
        return {}
      },
    },
    cancel: {
      permission: 'downloads',
      input: z.object({ taskId: z.string().min(1) }).passthrough(),
      handler: (input: { taskId: string }, _ctx: DomainCallContext, deps: FacilityDeps) => {
        deps.downloads.cancel(input.taskId)
        return {}
      },
    },
    dismiss: {
      permission: 'downloads',
      input: z.object({ taskId: z.string().min(1) }).passthrough(),
      handler: (input: { taskId: string }, _ctx: DomainCallContext, deps: FacilityDeps) => {
        deps.downloads.dismiss(input.taskId)
        return {}
      },
    },
  },
  update: {
    state: {
      permission: 'update',
      input: noInput,
      handler: (_input: unknown, _ctx: DomainCallContext, deps: FacilityDeps) => {
        if (!deps.update) { throw new PlatformError('DOMAIN_UNAVAILABLE', '更新通道未装配（flavor 未配置 manifestUrl）') }
        return deps.update.getState()
      },
    },
    check: {
      permission: 'update',
      input: noInput,
      handler: async (_input: unknown, _ctx: DomainCallContext, deps: FacilityDeps) => {
        if (!deps.update) { throw new PlatformError('DOMAIN_UNAVAILABLE', '更新通道未装配（flavor 未配置 manifestUrl）') }
        return deps.update.check()
      },
    },
  },
} satisfies Record<string, Record<string, FacilityRoute>>

function findRoute(method: string): { route: FacilityRoute, full: string } | undefined {
  const dot = method.indexOf('.')
  if (dot <= 0) { return undefined }
  const domain = method.slice(0, dot)
  const name = method.slice(dot + 1)
  const group = (FACILITY_ROUTES as Record<string, Record<string, FacilityRoute>>)[domain]
  const route = group?.[name]
  return route ? { route, full: method } : undefined
}

export function hasFacilityRoute(method: string): boolean {
  return findRoute(method) !== undefined
}

/** 设施调用统一入口：zod 校验 → 权限闸门 → 服务调用。找不到路由返回 undefined（回落设备域路由）。 */
export async function callFacility(
  deps: FacilityDeps,
  method: string,
  input: unknown,
  ctx: DomainCallContext,
): Promise<unknown | undefined> {
  const found = findRoute(method)
  if (!found) { return undefined }
  const parsed = found.route.input.safeParse(input ?? {})
  if (!parsed.success) {
    throw new PlatformError('VALIDATION_FAILED', `设施入参校验失败: ${method}: ${parsed.error.issues[0]?.message}`)
  }
  // check 只查判定不触发授权浮层（prompt 判定在无浮层语境下按 store/默认拒绝落定），origin 不参与键
  const verdict = await deps.permissions.check({ appId: ctx.appId, origin: '', permission: found.route.permission })
  if (verdict !== 'allow') {
    throw new PlatformError('PERMISSION_DENIED', `应用未声明 ${found.route.permission} 权限: ${method}`)
  }
  return found.route.handler(parsed.data, ctx, deps)
}

/**
 * 应用页事件接力器：事件总线广播只达 BrowserWindow 渲染层，应用页挂在
 * WebContentsView 上收不到；按白名单把平台事件补投给全部已登记应用视图。
 * capture.frame / scanner:* 直推通道不进总线，白名单命中也对它们是空操作，无重复投递。
 */
export function registerAppEventRelay(deps: { callers: CallerRegistry, events: EventBus }): () => void {
  return deps.events.onAny((event, payload) => {
    if (!(APP_EVENT_WHITELIST as readonly string[]).includes(event)) { return }
    for (const [wcId, caller] of deps.callers.entries()) {
      if (caller.kind !== 'view') { continue }
      const target = webContents.getAllWebContents().find(wc => wc.id === wcId)
      if (target && !target.isDestroyed()) { target.send(`event:${event}`, payload) }
    }
  })
}
