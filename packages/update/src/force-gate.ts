import type { EventBus } from '@shell/kernel'
import type { ForceUpdateDecision } from '@shell/shared'
import type { UpdateManifest } from './manifest'
import { resolveForceUpdate } from '@shell/shared'
import { fetchUpdateManifest } from './manifest'

/**
 * 强制更新门禁：清单声明 minVersion，当前壳版本低于它即阻断使用。
 * 判定用 resolveForceUpdate（fail-open：清单拉取失败保持当前决策，不阻塞使用）；
 * 决策从放行转为阻断时发一次 update.force-required，渲染层据此切换门禁页。
 * 巡检与 UpdateCenter 相互独立：各自拉清单，频率对齐即可。
 */
export interface ForceUpdateGateOptions {
  manifestUrl: string
  allowedOrigins: string[]
  currentVersion: () => string
  events: EventBus
  /** 测试注入点：默认 fetchUpdateManifest */
  fetchManifest?: (url: string, origins: string[]) => Promise<UpdateManifest>
  /** 复评间隔 ms；0 = 只在 evaluate 手动调用时评估（默认 6h） */
  intervalMs?: number
}

export class ForceUpdateGate {
  private decision: ForceUpdateDecision = { blocked: false }
  private timer?: NodeJS.Timeout
  private kickoff?: NodeJS.Timeout

  constructor(private readonly options: ForceUpdateGateOptions) {}

  get snapshot(): ForceUpdateDecision {
    return this.decision
  }

  /** 启动评估一次并按间隔复评；句柄纳入 stop 清理 */
  async start(): Promise<void> {
    void this.evaluate()
    const interval = this.options.intervalMs ?? 6 * 60 * 60 * 1000
    if (interval > 0) {
      this.kickoff = setTimeout(() => {
        this.timer = setInterval(() => void this.evaluate(), interval)
      }, 60_000)
    }
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = undefined
    }
    if (this.kickoff) {
      clearTimeout(this.kickoff)
      this.kickoff = undefined
    }
  }

  /** 单次评估：清单拉取失败保持原决策；放行→阻断的转变发事件 */
  async evaluate(): Promise<ForceUpdateDecision> {
    const fetchManifest = this.options.fetchManifest ?? fetchUpdateManifest
    try {
      const manifest = await fetchManifest(this.options.manifestUrl, this.options.allowedOrigins)
      const next = resolveForceUpdate(this.options.currentVersion(), manifest.minVersion)
      const wasBlocked = this.decision.blocked
      this.decision = next
      if (next.blocked && !wasBlocked) {
        this.options.events.emit('update.force-required', { requiredVersion: next.requiredVersion ?? '' })
      }
    }
    catch {
      // 网络失败 fail-open：保持原决策，等下一轮复评
    }
    return this.decision
  }
}
