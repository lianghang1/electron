import type { DeviceCapabilityId } from '@shell/shared'
import { DEVICE_CAPABILITIES, DEVICE_CAPABILITY_IDS, PLATFORM_CAPABILITIES } from '@shell/shared'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { CAPABILITIES } from './contracts/device-contract'
import { buildDeviceStatuses } from './runtime/device-status'
import { CAPABILITY_DESCRIPTORS } from './runtime/platform-profiles'

// 装配目录所在模块的值依赖链含 electron；只读取登记元数据，不实例化窗口或守护进程。
vi.mock('electron', () => ({
  BrowserWindow: class {},
  utilityProcess: {},
  webContents: {},
  net: {},
  app: {},
}))

type Catalog = typeof import('./gateway')

let catalog: Catalog

beforeAll(async () => {
  catalog = await import('./gateway')
})

const sorted = (xs: readonly string[]): string[] => [...xs].sort()

describe('生产装配一致性：能力身份表是唯一事实源', () => {
  it('装配目录、配置档案、诊断描述符、契约词表、平台开放清单覆盖同一组能力', () => {
    const ids = sorted(DEVICE_CAPABILITY_IDS)
    expect(sorted(Object.keys(catalog.DOMAIN_SPECS))).toEqual(ids)
    expect(sorted(catalog.CONFIG_CAPABILITIES.map(c => c.id))).toEqual(ids)
    expect(sorted(CAPABILITY_DESCRIPTORS.map(c => c.id))).toEqual(ids)
    expect(sorted([...new Set(CAPABILITIES.map(c => c.id.split(':')[0]))])).toEqual(ids)
    expect(sorted(PLATFORM_CAPABILITIES.win32.availableDomains)).toEqual(ids)
  })

  it('配置档案的 label 与能力身份表逐项一致，出厂档案与白名单非空', () => {
    for (const { id, label } of DEVICE_CAPABILITIES) {
      const spec = catalog.DOMAIN_SPECS[id]
      const config = catalog.CONFIG_CAPABILITIES.find(c => c.id === id)
      expect(config?.label).toBe(label)
      expect(spec.config.profiles.length).toBeGreaterThan(0)
      expect(spec.config.overridableKeys.length).toBeGreaterThan(0)
    }
  })

  it('每个能力都登记了装配器与通道声明，通道 capabilityId 不串域', () => {
    for (const id of DEVICE_CAPABILITY_IDS) {
      const spec = catalog.DOMAIN_SPECS[id]
      expect(typeof spec.assemble).toBe('function')
      expect(spec.channels.length).toBeGreaterThan(0)
      for (const channel of spec.channels) {
        expect(channel.capabilityId).toBe(id)
      }
    }
  })

  it('诊断台取到真实通道 id，不再回落到占位拼接值', () => {
    const statuses = buildDeviceStatuses(
      CAPABILITY_DESCRIPTORS,
      [],
      PLATFORM_CAPABILITIES.win32.availableDomains,
      'win32',
      catalog.channelIdFor,
    )
    expect(statuses).toHaveLength(DEVICE_CAPABILITY_IDS.length)
    for (const status of statuses) {
      expect(status.state).toBe('ready')
      const declared = catalog.DOMAIN_SPECS[status.capabilityId as DeviceCapabilityId].channels.map(c => c.id)
      expect(declared).toContain(status.channelId)
      expect(status.channelId).not.toContain(':assembled')
    }
  })

  it('新增能力身份而漏登记装配目录会在编译期被 Record 约束拦下', () => {
    // 该断言锁定类型契约：DOMAIN_SPECS 的键集合必须等于 DeviceCapabilityId。
    const keys: readonly DeviceCapabilityId[] = Object.keys(catalog.DOMAIN_SPECS) as DeviceCapabilityId[]
    expect(sorted(keys)).toEqual(sorted(DEVICE_CAPABILITY_IDS))
  })
})
