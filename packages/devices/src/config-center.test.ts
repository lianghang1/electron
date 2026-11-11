import type { DeviceCapabilitySpec, StoredConfigDocument } from './config-center'
import { describe, expect, it } from 'vitest'
import { createDeviceConfigCenter } from './config-center'

const specs: readonly DeviceCapabilitySpec[] = [
  {
    id: 'idcard',
    label: '身份证',
    overridableKeys: ['displayName', 'ws'],
    profiles: [
      { id: 'camsdk', displayName: '出厂阅读器', ws: { url: 'ws://factory' } },
      { id: 'huashi', displayName: '华视', transport: 'dll' },
    ],
  },
  {
    id: 'print',
    label: '打印',
    overridableKeys: ['paper', 'channel'],
    profiles: [{ id: 'print-default', paper: 'A4', channel: 'auto' }],
  },
]

function makeCenter() {
  let doc: StoredConfigDocument | undefined
  const writes: StoredConfigDocument[] = []
  const center = createDeviceConfigCenter({
    capabilities: specs,
    read: () => doc,
    write: (next) => { doc = next; writes.push(next) },
  })
  return { center, writes, getDoc: () => doc }
}

describe('六域配置中心', () => {
  it('初始快照等于出厂档案，无覆盖字段', () => {
    const { center } = makeCenter()
    const sections = center.snapshot()
    expect(sections).toHaveLength(2)
    expect(sections[0].profiles[0].current.displayName).toBe('出厂阅读器')
    expect(sections[0].profiles[0].overridden).toEqual([])
    expect(center.capabilities().map(c => c.id)).toEqual(['idcard', 'print'])
  })

  it('写入白名单字段生效并持久化，白名单外字段被忽略', () => {
    const { center, getDoc } = makeCenter()
    center.setOverrides('idcard', 'camsdk', { displayName: '现场名称', transport: 'ws' })
    const profile = center.snapshot('idcard')[0].profiles[0]
    expect(profile.current.displayName).toBe('现场名称')
    expect(profile.current.transport).toBeUndefined()
    expect(profile.overridden).toEqual(['displayName'])
    expect(getDoc()?.idcard.overrides.camsdk.displayName).toBe('现场名称')
  })

  it('恢复出厂清覆盖并保留持久化', () => {
    const { center, writes } = makeCenter()
    center.setOverrides('idcard', 'camsdk', { displayName: '临时' })
    center.resetToFactory('idcard')
    const profile = center.snapshot('idcard')[0].profiles[0]
    expect(profile.current.displayName).toBe('出厂阅读器')
    expect(profile.overridden).toEqual([])
    expect(writes.length).toBeGreaterThanOrEqual(2)
  })

  it('factoryPatches 只含可覆盖字段的出厂值', () => {
    const { center } = makeCenter()
    const patches = center.factoryPatches('idcard')
    expect(patches).toHaveLength(2)
    expect(patches[0]).toMatchObject({ capabilityId: 'idcard', deviceProfileId: 'camsdk' })
    expect(patches[0].patch.displayName).toBe('出厂阅读器')
    expect(patches[0].patch.transport).toBeUndefined()
    expect(patches[0].patch.id).toBeUndefined()
  })

  it('未知能力与未知档案给出错误', () => {
    const { center } = makeCenter()
    expect(() => center.setOverrides('missing', 'x', {})).toThrow(/未知能力/)
    expect(() => center.setOverrides('idcard', 'missing', {})).toThrow(/未知设备档案/)
  })

  it('按能力筛选快照，不影响其他能力', () => {
    const { center } = makeCenter()
    center.setOverrides('print', 'print-default', { paper: 'A5' })
    expect(center.snapshot('print')[0].profiles[0].current.paper).toBe('A5')
    expect(center.snapshot('idcard')[0].profiles[0].overridden).toEqual([])
  })
})
