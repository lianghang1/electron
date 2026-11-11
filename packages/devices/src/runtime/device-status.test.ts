import type { CapabilityDescriptor, SupportResolution } from './registry'
import { describe, expect, it } from 'vitest'
import { buildDeviceStatuses } from './device-status'

const capabilities: CapabilityDescriptor[] = [
  { id: 'print', label: '打印' },
  { id: 'capture', label: '拍摄' },
  { id: 'signature', label: '签名' },
]

const resolutions: SupportResolution[] = [
  { capabilityId: 'print', platformId: 'linux', supported: false, reason: 'vendor-sdk-unavailable', detail: '无可用实现：print/linux' },
  { capabilityId: 'capture', platformId: 'linux', supported: false, reason: 'platform-unsupported', detail: '该平台未开放能力' },
  { capabilityId: 'signature', platformId: 'linux', supported: true, channelId: 'sig-ws' },
]

describe('六域设备状态构建', () => {
  it('开放能力为 ready 且带平台 id 与实现通道', () => {
    const statuses = buildDeviceStatuses(capabilities, resolutions, ['print', 'signature'], 'linux')
    expect(statuses).toHaveLength(3)
    expect(statuses[0]).toMatchObject({ deviceId: 'print', state: 'ready', platformId: 'linux' })
    expect(statuses[2].channelId).toBe('sig-ws')
  })

  it('未开放能力为 unavailable 并沿用求交结论的原因码', () => {
    const statuses = buildDeviceStatuses(capabilities, resolutions, ['signature'], 'linux')
    expect(statuses[1]).toMatchObject({ deviceId: 'capture', state: 'unavailable', reason: 'platform-unsupported' })
    expect(statuses[1].detail).toContain('未开放')
  })

  it('缺少求交结论时回落平台未开放', () => {
    const statuses = buildDeviceStatuses(capabilities, [], [], 'darwin')
    for (const status of statuses) {
      expect(status.state).toBe('unavailable')
      expect(status.reason).toBe('platform-unsupported')
    }
  })
})
