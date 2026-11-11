import type { ChannelId, PrintOptions } from '@shell/shared'
import { describe, expect, it } from 'vitest'
import { channelMode, resolveChannelPreference } from './channel-selection'

const opts = (extra: Partial<PrintOptions> = {}): PrintOptions => ({ paper: 'A4', ...extra })

describe('打印通道路由决策', () => {
  it('缺省为 auto', () => {
    expect(resolveChannelPreference(opts())).toBe('auto')
  })

  it('显式 channel 优先于便捷开关', () => {
    expect(resolveChannelPreference(opts({ channel: 'simulated', preview: true, dryRun: true }))).toBe('simulated')
  })

  it('preview 开关映射到 preview 通道，且优先于 dryRun', () => {
    expect(resolveChannelPreference(opts({ preview: true, dryRun: true }))).toBe('preview')
  })

  it('dryRun 开关映射到 dry-run 通道', () => {
    expect(resolveChannelPreference(opts({ dryRun: true }))).toBe('dry-run')
  })

  it('五个 ChannelId 与执行方式一一对应', () => {
    const cases: ReadonlyArray<readonly [ChannelId, string]> = [
      ['system', 'spool'],
      ['ipp', 'spool'],
      ['simulated', 'simulated'],
      ['preview', 'preview'],
      ['dry-run', 'dry-run'],
    ]
    for (const [id, mode] of cases) {
      expect(channelMode(id), id).toBe(mode)
    }
  })
})
