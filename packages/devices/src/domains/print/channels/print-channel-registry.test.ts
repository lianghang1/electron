import type { ChannelId } from '@shell/shared'
import type { PrintChannel } from './print-channel'
import { describe, expect, it } from 'vitest'
import { createPrintChannelRegistry } from './print-channel-registry'
import { PRINT_CHANNELS } from './registry'

function stubChannel(id: ChannelId, descriptorId: string): PrintChannel {
  return {
    id,
    descriptorId,
    spools: false,
    execute: async () => ({}),
  }
}

describe('打印通道注册表', () => {
  it('登记合法实现并可按 id 查表', () => {
    const registry = createPrintChannelRegistry()
    const ch = stubChannel('simulated', 'simulated')
    registry.register(ch)
    expect(registry.count()).toBe(1)
    expect(registry.get('simulated')).toBe(ch)
    expect(registry.require('simulated')).toBe(ch)
    expect(registry.ids()).toEqual(['simulated'])
    expect(registry.list()).toEqual([ch])
  })

  it('拒绝没有能力声明的实现', () => {
    const registry = createPrintChannelRegistry()
    expect(() => registry.register(stubChannel('preview', 'missing-descriptor'))).toThrow(/能力声明/)
  })

  it('拒绝重复登记', () => {
    const registry = createPrintChannelRegistry()
    registry.register(stubChannel('preview', 'preview'))
    expect(() => registry.register(stubChannel('preview', 'preview'))).toThrow(/重复注册/)
  })

  it('require 未知通道给出明确错误', () => {
    const registry = createPrintChannelRegistry()
    expect(() => registry.require('ipp')).toThrow(/未知通道/)
  })

  it('每条 simulated 声明都能对应到可登记实现', () => {
    const registry = createPrintChannelRegistry()
    for (const d of PRINT_CHANNELS.filter(x => x.simulated)) {
      registry.register(stubChannel(d.id as ChannelId, d.id))
    }
    expect(registry.count()).toBe(3)
  })
})
