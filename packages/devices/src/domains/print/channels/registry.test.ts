import { describe, expect, it } from 'vitest'
import { channelsForPlatform, PRINT_CHANNEL_DESCRIPTORS, PRINT_CHANNELS } from './registry'

const PLATFORMS = ['win32', 'darwin', 'linux', 'linux-cn', 'linux-arm64', 'loongarch64']

describe('print 域能力 × 实现 × 平台声明', () => {
  it('每个 ChannelId 都至少有一条能力声明，且声明 id 存在', () => {
    for (const [id, descriptors] of Object.entries(PRINT_CHANNEL_DESCRIPTORS)) {
      expect(descriptors.length, id).toBeGreaterThan(0)
      for (const descriptorId of descriptors) {
        expect(PRINT_CHANNELS.some(d => d.id === descriptorId), `${id} → ${descriptorId}`).toBe(true)
      }
    }
  })

  it('声明 id 唯一且 capabilityId 均为 print', () => {
    expect(new Set(PRINT_CHANNELS.map(d => d.id)).size).toBe(PRINT_CHANNELS.length)
    for (const d of PRINT_CHANNELS) {
      expect(d.capabilityId).toBe('print')
    }
  })

  it('三种无硬件实现标记为 simulated 且六端可用', () => {
    for (const id of ['simulated', 'preview', 'dry-run']) {
      const d = PRINT_CHANNELS.find(x => x.id === id)
      expect(d?.simulated, id).toBe(true)
      expect(d?.platformIds, id).toEqual(expect.arrayContaining(PLATFORMS))
    }
  })

  it('六端都能筛出 print 实现，Windows 独有 sumatra 与 esc-pos，Linux 走 cups', () => {
    for (const platform of PLATFORMS) {
      expect(channelsForPlatform('print', platform).length, platform).toBeGreaterThan(0)
    }
    const win = channelsForPlatform('print', 'win32').map(d => d.id)
    expect(win).toContain('sumatra-pdf')
    expect(win).toContain('raw-escpos')
    const linux = channelsForPlatform('print', 'linux').map(d => d.id)
    expect(linux).toContain('cups-lp')
    expect(linux).not.toContain('sumatra-pdf')
  })

  it('非 print 能力筛不出结果', () => {
    expect(channelsForPlatform('capture', 'win32')).toHaveLength(0)
  })
})
