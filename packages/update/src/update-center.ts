import type { Startable } from '@shell/kernel'

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
 * 公共设施（灰度、重入防护、事件上报）由 UpdateCenter 统一提供。
 * 每条路径的验收：任何中断后，下次启动必须落在可运行版本。
 */
export interface UpdateChannel {
  readonly id: 'dist-hot' | 'asar-hot' | 'full-package'
  check(current: VersionMatrix): Promise<UpdatePlan | null>
  apply(plan: UpdatePlan): Promise<ApplyResult>
}

/** 灰度判定：设备 ID 白名单优先，其次百分比放量 */
export function isGreylisted(deviceId: string, whitelist: string[], percent: number): boolean {
  if (whitelist.includes(deviceId))
    return true
  let hash = 0
  for (const ch of deviceId)
    hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return (hash % 100) < percent
}

export class UpdateCenter implements Startable {
  readonly name = 'update'

  constructor(private readonly channels: UpdateChannel[]) {}

  async start(): Promise<void> {}
  async stop(): Promise<void> {}

  async check(current: VersionMatrix): Promise<UpdatePlan | null> {
    for (const channel of this.channels) {
      const plan = await channel.check(current)
      if (plan)
        return plan
    }
    return null
  }

  async apply(plan: UpdatePlan): Promise<ApplyResult> {
    const channel = this.channels.find(c => c.id === plan.channel)
    if (!channel)
      return { ok: false, requiresRestart: false, error: `unknown channel: ${plan.channel}` }
    return channel.apply(plan)
  }
}
