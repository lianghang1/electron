import type { EventBus, Startable } from '@shell/kernel'
import { effectiveVersion } from './boot/pointer'

/** 版本矩阵：设备当前各层版本，与服务端清单比对 */
export interface VersionMatrix {
  shell: string
  asar?: string
  apps: Record<string, string>
}

export interface UpdatePlan {
  channel: string
  targetVersion: string
  /** 原子切换前必须完成的校验（sha256/签名）由各通道自行执行 */
  downloadUrl: string
  /** 通道自有载荷（appId / sha256 / silentArgs），平台不解析 */
  payload?: Record<string, string>
}

export interface ApplyResult {
  ok: boolean
  /** 需要重启才生效（asar/整包）；dist 热更免重启 */
  requiresRestart: boolean
  error?: string
}

export interface UpdateState {
  status: 'idle' | 'checking' | 'downloading' | 'applying' | 'pending-restart' | 'failed' | 'cancelled'
  channel?: string
  version?: string
  error?: string
  checkedAt?: number
}

/**
 * 更新通道 SPI：平台只认识此接口。
 * 三通道（dist-hot 免重启 / asar-hot 指针切换 / full-package 锁屏安装）各自实现，
 * 公共设施（事件上报、调度、状态快照、取消）由 UpdateCenter 统一提供。
 * 每条路径的验收：任何中断后，下次启动必须落在可运行版本。
 */
export interface UpdateChannel {
  readonly id: 'dist-hot' | 'asar-hot' | 'full-package'
  check: (current: VersionMatrix) => Promise<UpdatePlan | null>
  apply: (plan: UpdatePlan, signal?: AbortSignal) => Promise<ApplyResult>
}

export interface UpdateCenterOptions {
  channels: UpdateChannel[]
  events: EventBus
  /** 版本矩阵由组合根注入（读 appsRoot 版本文件与热更指针），未注入时退化为指针生效版本 */
  versionMatrix?: () => Promise<VersionMatrix>
  /** 巡检间隔 ms；0 = 不自动巡检（默认 6h） */
  intervalMs?: number
}

export class UpdateCenter implements Startable {
  readonly name = 'update'
  private timer?: NodeJS.Timeout
  private kickoff?: NodeJS.Timeout
  /** 巡检重入防护：定时触发与手动调用叠加时，同一时刻只跑一轮 */
  private inFlight = false
  private controller?: AbortController
  private state: UpdateState = { status: 'idle' }
  /** 单轮最多连续应用的免重启更新数，防止清单异常导致死循环 */
  private static readonly MAX_PER_ROUND = 8

  constructor(private readonly options: UpdateCenterOptions) {}

  async start(): Promise<void> {
    const interval = this.options.intervalMs ?? 6 * 60 * 60 * 1000
    if (interval > 0) { this.timer = setInterval(() => void this.checkAndApply(), interval) }
    // 启动即巡检一次（延迟 1min，避开启动高峰）；句柄纳入 stop 清理，避免退出后仍触发
    this.kickoff = setTimeout(() => void this.checkAndApply(), 60_000)
  }

  async stop(): Promise<void> {
    this.cancel()
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = undefined
    }
    if (this.kickoff) {
      clearTimeout(this.kickoff)
      this.kickoff = undefined
    }
  }

  /** 状态快照：渲染层查询进度 / 展示取消按钮 / 展示重启提示 */
  getState(): UpdateState {
    return { ...this.state }
  }

  /** 取消进行中的下载：解压与指针写入是原子收尾，不可中断 */
  cancel(): void {
    if (!this.inFlight) { return }
    this.controller?.abort()
    this.pushState({ status: 'cancelled' })
  }

  /** 是否有待重启生效的更新（asar pending 或整包排程） */
  hasPendingRestart(): boolean {
    return this.state.status === 'pending-restart'
  }

  private pushState(next: UpdateState): void {
    this.state = { ...next, checkedAt: Date.now() }
    this.options.events.emit('update.state-changed', this.state)
  }

  /**
   * 巡检一轮：连续应用免重启更新（dist-hot 可一次覆盖多个应用），
   * 命中需重启的通道（asar/整包）应用后立即停下，等下一次启动生效。
   */
  async checkAndApply(current?: VersionMatrix): Promise<ApplyResult | { skipped: string }> {
    if (this.inFlight) { return { skipped: 'in-flight' } }
    this.inFlight = true
    this.controller = new AbortController()
    this.pushState({ status: 'checking' })
    try {
      let last: ApplyResult | undefined
      for (let i = 0; i < UpdateCenter.MAX_PER_ROUND; i++) {
        const plan = await this.check(current)
        if (!plan) {
          this.pushState({ status: 'idle' })
          return last ?? { skipped: 'up-to-date' }
        }
        this.pushState({ status: 'downloading', channel: plan.channel, version: plan.targetVersion })
        const result = await this.apply(plan, this.controller.signal)
        if (result.ok) {
          this.options.events.emit('update.applied', { channel: plan.channel, version: plan.targetVersion })
          if (result.requiresRestart) {
            this.options.events.emit('update.restart-required', { channel: plan.channel, version: plan.targetVersion })
            this.pushState({ status: 'pending-restart', channel: plan.channel, version: plan.targetVersion })
          }
          else {
            this.pushState({ status: 'applying', channel: plan.channel, version: plan.targetVersion })
          }
        }
        else {
          this.options.events.emit('update.failed', { channel: plan.channel, reason: result.error ?? 'unknown' })
          this.pushState({ status: 'failed', channel: plan.channel, error: result.error ?? 'unknown' })
        }
        last = result
        // 失败或需重启时停止，避免反复重试同一计划
        if (!result.ok || result.requiresRestart) { return result }
      }
      this.pushState({ status: 'idle' })
      return last ?? { skipped: 'up-to-date' }
    }
    catch (err) {
      const reason = this.controller.signal.aborted ? 'cancelled' : String(err)
      this.options.events.emit('update.failed', { channel: 'unknown', reason })
      this.pushState({ status: this.controller.signal.aborted ? 'cancelled' : 'failed', error: reason })
      return { skipped: 'error' }
    }
    finally {
      this.inFlight = false
      this.controller = undefined
    }
  }

  async check(current?: VersionMatrix): Promise<UpdatePlan | null> {
    const matrix = current ?? await this.collectVersionMatrix()
    for (const channel of this.options.channels) {
      const plan = await channel.check(matrix)
      if (plan) {
        this.options.events.emit('update.checked', { channel: plan.channel, available: true })
        return plan
      }
    }
    this.options.events.emit('update.checked', { channel: 'none', available: false })
    return null
  }

  async apply(plan: UpdatePlan, signal?: AbortSignal): Promise<ApplyResult> {
    const channel = this.options.channels.find(c => c.id === plan.channel)
    if (!channel) { return { ok: false, requiresRestart: false, error: `unknown channel: ${plan.channel}` } }
    return channel.apply(plan, signal)
  }

  private async collectVersionMatrix(): Promise<VersionMatrix> {
    if (this.options.versionMatrix) { return this.options.versionMatrix() }
    const { app } = await import('electron')
    return { shell: effectiveVersion(app.getVersion()), apps: {} }
  }
}
