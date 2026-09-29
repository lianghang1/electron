import type { AppPermissionState, CallerContext, Permission } from '@desktop/shared'
import type Store from 'electron-store'
import type { AppRegistry } from '../app/app-registry'
import type { EventBus } from '../event/event-bus'
import type { Logger } from '../logger/logger'
import { randomUUID } from 'node:crypto'
import { DesktopError, PERMISSIONS } from '@desktop/shared'
import { SHELL_APP_ID } from '../constants'

/** 运行时权限超时：用户长时间不决策按拒绝处理，不能让页面永远挂起 */
const RUNTIME_REQUEST_TIMEOUT_MS = 30_000

/** 运行时决策持久化结构：appId:permission → 用户选择（平台级，重启保留） */
export interface PermissionStoreSchema {
  decisions: Record<string, boolean>
}

interface RuntimeRequest {
  requestId: string
  appId: string
  permission: Permission
  resolve: (granted: boolean) => void
  timer: NodeJS.Timeout
}

/**
 * 权限的唯一授权方：check / assert 都只在 Main 进程执行。
 * Shell 是平台自身，全量放行；普通 App 按 manifest.permissions 判定。
 * manifest 未声明的权限走运行时授权：推送 Shell 询问用户，
 * 用户决策持久化到平台存储（userData/platform-permissions.json），重启后不再重复询问。
 */
export class PermissionService {
  /** 运行时决策内存缓存（读穿持久化存储） */
  private readonly runtimeDecisions = new Map<string, boolean>()
  /** 决策中的请求去重：appId:permission → 挂起 Promise（未处理前重复触发复用同一次询问） */
  private readonly runtimeInflight = new Map<string, Promise<boolean>>()
  /** 等待用户决策的请求：requestId → 挂起状态 */
  private readonly pendingRuntime = new Map<string, RuntimeRequest>()

  constructor(
    private readonly registry: AppRegistry,
    private readonly events: EventBus,
    private readonly logger: Logger,
    private readonly store?: Store<PermissionStoreSchema>,
  ) {
    for (const [key, granted] of Object.entries(store?.get('decisions') ?? {}))
      this.runtimeDecisions.set(key, granted)
  }

  check(context: CallerContext, permission: Permission): boolean {
    if (context.appId === SHELL_APP_ID)
      return true
    return this.registry.get(context.appId)?.permissions?.includes(permission) ?? false
  }

  /** 校验失败即抛出：Main 内部服务调用系统操作前的强制关卡 */
  assert(context: CallerContext, permission: Permission): void {
    if (this.check(context, permission))
      return
    this.events.emit('permission:denied', { context, permission })
    this.logger.warn(`permission denied: ${permission}`, { appId: context.appId })
    throw new DesktopError('PERMISSION_DENIED', `Permission denied: ${permission}`, {
      appId: context.appId,
      permission,
    })
  }

  getPermissions(appId: string): Permission[] {
    if (appId === SHELL_APP_ID)
      return [...PERMISSIONS]
    return [...(this.registry.get(appId)?.permissions ?? [])]
  }

  /**
   * 运行时授权：manifest 未声明的权限，推送 Shell 请用户决策。
   * - 决策持久化（平台存储）：同 App 同权限重启后不再询问
   * - 决策进行中重复触发复用同一次询问（页面不产生第二张授权卡）
   * - 超时按拒绝处理
   */
  async requestRuntime(context: CallerContext, permission: Permission): Promise<boolean> {
    const cacheKey = `${context.appId}:${permission}`
    const cached = this.runtimeDecisions.get(cacheKey)
    if (cached !== undefined)
      return cached
    const inflight = this.runtimeInflight.get(cacheKey)
    if (inflight)
      return inflight

    const appName = this.registry.get(context.appId)?.name ?? context.appId
    const requestId = randomUUID()
    const request = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        const pending = this.pendingRuntime.get(requestId)
        if (pending)
          this.finishRuntimeRequest(pending, false)
        this.logger.warn(`runtime permission request timed out: ${permission}`, { appId: context.appId })
        resolve(false)
      }, RUNTIME_REQUEST_TIMEOUT_MS)
      this.pendingRuntime.set(requestId, {
        requestId,
        appId: context.appId,
        permission,
        resolve,
        timer,
      })
      this.events.emit('permission:request', {
        requestId,
        appId: context.appId,
        appName,
        permission,
        requestedAt: Date.now(),
      })
    })
    this.runtimeInflight.set(cacheKey, request)
    const granted = await request
    this.runtimeInflight.delete(cacheKey)
    this.setRuntimeDecision(cacheKey, granted)
    this.logger.info(`runtime permission ${granted ? 'granted' : 'denied'}: ${permission}`, {
      appId: context.appId,
    })
    return granted
  }

  /** App 权限状态（声明 + 运行时决策合成视图），供 Shell 管理面展示 */
  listPermissionStates(appId: string): AppPermissionState[] {
    const declared = appId === SHELL_APP_ID ? [...PERMISSIONS] : this.getPermissions(appId)
    return PERMISSIONS.map((permission) => {
      const isDeclared = declared.includes(permission)
      const granted = isDeclared ? true : this.runtimeDecisions.get(`${appId}:${permission}`) ?? null
      return { permission, declared: isDeclared, granted }
    })
  }

  /** Shell 用户决策回传：结束挂起的请求 */
  respond(requestId: string, granted: boolean): void {
    const pending = this.pendingRuntime.get(requestId)
    if (!pending)
      return
    this.finishRuntimeRequest(pending, granted)
  }

  /** 撤销 App 的全部运行时授权决策（应用中心「重置授权」）：清内存与持久化，下次请求重新询问 */
  resetRuntime(appId: string): void {
    const prefix = `${appId}:`
    for (const key of [...this.runtimeDecisions.keys()]) {
      if (key.startsWith(prefix))
        this.runtimeDecisions.delete(key)
    }
    if (!this.store)
      return
    const decisions = { ...this.store.get('decisions') }
    for (const key of Object.keys(decisions)) {
      if (key.startsWith(prefix))
        delete decisions[key]
    }
    this.store.set('decisions', decisions)
  }

  /** App 退出（Tab 关闭）时取消其全部挂起请求：页面已不存在，按拒绝处理并清缓存 */
  cancelForApp(appId: string): void {
    for (const pending of [...this.pendingRuntime.values()]) {
      if (pending.appId !== appId)
        continue
      this.finishRuntimeRequest(pending, false)
    }
  }

  /** 结束运行时请求：按给定决策 resolve，并广播决策结果（审计订阅） */
  private finishRuntimeRequest(pending: RuntimeRequest, granted: boolean): void {
    for (const [key, entry] of this.pendingRuntime) {
      if (entry !== pending)
        continue
      this.pendingRuntime.delete(key)
      break
    }
    clearTimeout(pending.timer)
    pending.resolve(granted)
    this.events.emit('permission:decided', {
      requestId: pending.requestId,
      appId: pending.appId,
      permission: pending.permission,
      granted,
    })
  }

  /** 决策写内存 + 写透持久化存储（无存储实例时仅内存，如单测环境） */
  private setRuntimeDecision(key: string, granted: boolean): void {
    this.runtimeDecisions.set(key, granted)
    if (!this.store)
      return
    this.store.set('decisions', { ...this.store.get('decisions'), [key]: granted })
  }
}
