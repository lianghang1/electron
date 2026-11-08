import type { EventBus, Startable } from '@shell/kernel'
import { isGreylisted } from './greylist'

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
}

export interface ApplyResult {
  ok: boolean
  /** 需要重启才生效（asar/整包）；dist 热更免重启 */
  requiresRestart: boolean
  error?: string
}

/**
 * 更新通道 SPI：平台只认识此接口。
 * 三通道（dist-hot 免重启 / asar-hot 原子换+回滚 / full-package 锁屏安装）各自实现，
 * 公共设施（灰度、事件上报、调度）由 UpdateCenter 统一提供。
 * 每条路径的验收：任何中断后，下次启动必须落在可运行版本。
 */
export interface UpdateChannel {
  readonly id: 'dist-hot' | 'asar-hot' | 'full-package'
  check: (current: VersionMatrix) => Promise<UpdatePlan | null>
  apply: (plan: UpdatePlan) => Promise<ApplyResult>
}

export interface UpdateCenterOptions {
  channels: UpdateChannel[]
  events: EventBus
  /** 设备指纹（灰度判定输入） */
  deviceId: string
  /** 灰度白名单与放量百分比（服务端清单下发，本地兜底全量） */
  greylist?: { whitelist: string[], percent: number }
  /** 巡检间隔 ms；0 = 不自动巡检（默认 6h） */
  intervalMs?: number
}

export class UpdateCenter implements Startable {
  readonly name = 'update'
  private timer?: NodeJS.Timeout

  constructor(private readonly options: UpdateCenterOptions) {}

  async start(): Promise<void> {
    const interval = this.options.intervalMs ?? 6 * 60 * 60 * 1000
    if (interval > 0) { this.timer = setInterval(() => void this.checkAndApply(), interval) }
    // 启动即巡检一次（延迟 1min，避开启动高峰）
    setTimeout(() => void this.checkAndApply(), 60_000)
  }

  async stop(): Promise<void> {
    if (this.timer) { clearInterval(this.timer) }
  }

  /** 巡检一轮：灰度过滤 → 首个可用 plan → 应用 → 事件上报 */
  async checkAndApply(current?: VersionMatrix): Promise<ApplyResult | { skipped: string }> {
    try {
      const plan = await this.check(current)
      if (!plan) {
        return { skipped: 'up-to-date' }
      }
      const result = await this.apply(plan)
      if (result.ok) { this.options.events.emit('update.applied', { channel: plan.channel, version: plan.targetVersion }) }
      else { this.options.events.emit('update.failed', { channel: plan.channel, reason: result.error ?? 'unknown' }) }
      return result
    }
    catch (err) {
      this.options.events.emit('update.failed', { channel: 'unknown', reason: String(err) })
      return { skipped: 'error' }
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

  async apply(plan: UpdatePlan): Promise<ApplyResult> {
    const channel = this.options.channels.find(c => c.id === plan.channel)
    if (!channel) { return { ok: false, requiresRestart: false, error: `unknown channel: ${plan.channel}` } }

    // 灰度闸门：白名单优先，其次百分比放量（未配置灰度 = 全量放行）
    if (this.options.greylist) {
      const { whitelist, percent } = this.options.greylist
      if (!isGreylisted(this.options.deviceId, whitelist, percent)) { return { ok: false, requiresRestart: false, error: 'greylisted: device not in rollout' } }
    }
    return channel.apply(plan)
  }

  /** 当前版本矩阵：shell 版本 + asar 版本 + 各 app 版本（app 版本以 appsRoot 清单为准，M6 收口） */
  private async collectVersionMatrix(): Promise<VersionMatrix> {
    const { app } = await import('electron')
    return {
      shell: app.getVersion(),
      apps: {},
    }
  }
}
