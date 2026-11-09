import type { AppManifest } from '@shell/shared'

/** 判定结果：allow/deny 直接落定，prompt 交授权浮层（无浮层即拒绝） */
export type PermissionVerdict = 'allow' | 'deny' | 'prompt'

export interface PermissionRule {
  readonly app: string
  readonly permission: string
  readonly verdict: PermissionVerdict
}

export interface PermissionRequest {
  appId: string
  origin: string
  permission: string
}

export interface PermissionDecision {
  request: PermissionRequest
  verdict: 'allow' | 'deny'
  source: 'policy' | 'store' | 'prompt' | 'default'
}

/** 持久化决策：prompt 被用户答复后不再反复打扰 */
export interface PermissionStore {
  get: (key: string) => Promise<PermissionVerdict | undefined>
  set: (key: string, verdict: PermissionVerdict) => Promise<void>
  /** 撤销已持久化的运行时决策 */
  delete?: (key: string) => Promise<void>
}

/** 可注入的授权浮层；未注入时 prompt 判定一律拒绝 */
export interface PermissionPrompt {
  ask: (request: PermissionRequest) => Promise<boolean>
}

export interface PermissionServiceOptions {
  rules: readonly PermissionRule[]
  store?: PermissionStore
  prompt?: PermissionPrompt
  audit?: (decision: PermissionDecision) => void
}

/** appId + permission 组成稳定键；origin 只作审计线索，不参与判定 */
function decisionKey(appId: string, permission: string): string {
  return `${appId}|${permission}`
}

/**
 * 权限策略：按 app/权限查表，未声明一律拒绝（fail-closed）。
 * prompt 决策经持久化与可注入浮层，任何异常或无浮层都收敛为拒绝；
 * 同一键的并发判定共享一次浮层调用，每次结论都进审计。
 */
export class PermissionService {
  private readonly rules = new Map<string, PermissionVerdict>()
  private readonly inflight = new Map<string, Promise<boolean>>()

  constructor(private readonly options: PermissionServiceOptions) {
    for (const rule of options.rules) {
      this.rules.set(decisionKey(rule.app, rule.permission), rule.verdict)
    }
  }

  async decide(request: PermissionRequest): Promise<boolean> {
    const key = decisionKey(request.appId, request.permission)
    const pending = this.inflight.get(key)
    if (pending) { return pending }
    const task = this.resolve(request, key).finally(() => this.inflight.delete(key))
    this.inflight.set(key, task)
    return task
  }

  /** 应用准入：打开动作与 manifest 声明的域/平台权限逐项过闸，任一拒绝即拒绝 */
  async allowsApp(manifest: AppManifest): Promise<boolean> {
    const claims = [
      'app.open',
      ...manifest.devices.map(device => `domain.${device}`),
      ...manifest.permissions,
    ]
    for (const permission of claims) {
      const allowed = await this.decide({
        appId: manifest.id,
        origin: `app://${manifest.id}`,
        permission,
      })
      if (!allowed) { return false }
    }
    return true
  }

  /**
   * 应用主动请求运行时授权：绕过策略表，读持久化结论或经浮层询问。
   * 超时与缺省拒绝由浮层宿主承担（master requestRuntime/respond 的重构表达）。
   */
  async requestRuntime(request: PermissionRequest): Promise<boolean> {
    const key = decisionKey(request.appId, request.permission)
    const stored = await this.options.store?.get(key).catch(() => undefined)
    if (stored === 'allow' || stored === 'deny') {
      const allowed = stored === 'allow'
      this.options.audit?.({ request, verdict: allowed ? 'allow' : 'deny', source: 'store' })
      return allowed
    }
    const granted = this.options.prompt
      ? await this.options.prompt.ask(request).catch(() => false)
      : false
    const verdict: PermissionVerdict = granted ? 'allow' : 'deny'
    if (this.options.store) {
      await this.options.store.set(key, verdict).catch(() => {})
    }
    this.options.audit?.({ request, verdict, source: 'prompt' })
    return granted
  }

  /** 只查询判定，不触发授权浮层（master ipc/permission.ts 的 check 语义） */
  async check(request: PermissionRequest): Promise<PermissionVerdict> {
    const key = decisionKey(request.appId, request.permission)
    const verdict = this.rules.get(key) ?? 'deny'
    if (verdict !== 'prompt') { return verdict }
    const stored = await this.options.store?.get(key).catch(() => undefined)
    return stored ?? 'prompt'
  }

  /** 应用的权限声明与策略判定快照，供工作台展示 */
  listStates(appId: string): { permission: string, verdict: PermissionVerdict }[] {
    const prefix = `${appId}|`
    return [...this.rules.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, verdict]) => ({ permission: key.slice(prefix.length), verdict }))
  }

  /** 撤销运行时授权：清除该权限在所有应用上的持久化结论 */
  async resetRuntime(permission: string): Promise<void> {
    const remove = this.options.store?.delete
    if (!remove) { return }
    for (const key of [...this.rules.keys()]) {
      if (key.endsWith(`|${permission}`)) { await remove(key).catch(() => {}) }
    }
  }

  private async resolve(request: PermissionRequest, key: string): Promise<boolean> {
    const rule = this.rules.get(key)
    let verdict: PermissionVerdict = rule ?? 'deny'
    let source: PermissionDecision['source'] = rule ? 'policy' : 'default'

    if (verdict === 'prompt') {
      const stored = await this.options.store?.get(key).catch(() => undefined)
      if (stored === 'allow' || stored === 'deny') {
        verdict = stored
        source = 'store'
      }
      else if (this.options.prompt) {
        const granted = await this.options.prompt.ask(request).catch(() => false)
        verdict = granted ? 'allow' : 'deny'
        source = 'prompt'
        if (this.options.store) {
          await this.options.store.set(key, verdict).catch(() => {})
        }
      }
      else {
        verdict = 'deny'
        source = 'default'
      }
    }

    const allowed = verdict === 'allow'
    this.options.audit?.({ request, verdict: allowed ? 'allow' : 'deny', source })
    return allowed
  }
}
