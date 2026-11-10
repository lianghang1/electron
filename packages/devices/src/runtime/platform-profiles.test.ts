import { PLATFORM_CAPABILITIES } from '@shell/shared'
import { describe, expect, it } from 'vitest'
import { createChannelRegistry } from './channel'
import { buildPlatformProfiles, CAPABILITY_DESCRIPTORS, registerStandardCatalog } from './platform-profiles'
import { createDeviceRegistry } from './registry'

describe('平台档案 —— 能力表接线、六平台求交、原因码', () => {
  it('档案与唯一事实源 PLATFORM_CAPABILITIES 逐平台一致', () => {
    const profiles = buildPlatformProfiles()
    expect(profiles).toHaveLength(Object.keys(PLATFORM_CAPABILITIES).length)
    for (const profile of profiles) {
      const source = PLATFORM_CAPABILITIES[profile.id as keyof typeof PLATFORM_CAPABILITIES]
      expect(source).toBeDefined()
      expect(profile.capabilityIds).toEqual(source.availableDomains)
      expect(profile.driverDeployment).toBe(source.driverDeployment)
      expect(profile.nativeSupported).toBe(source.nativeSupported)
    }
  })

  it('国产化平台（linux-cn / linux-arm64 / loongarch64）全部登记', () => {
    const ids = buildPlatformProfiles().map(p => p.id)
    expect(ids).toEqual(expect.arrayContaining(['linux-cn', 'linux-arm64', 'loongarch64']))
  })

  it('标准目录装配后，六平台对六能力都有明确结论（支持或带原因码）', () => {
    const registry = createDeviceRegistry(createChannelRegistry())
    registerStandardCatalog(registry)
    expect(registry.capabilities()).toHaveLength(CAPABILITY_DESCRIPTORS.length)

    for (const platform of buildPlatformProfiles()) {
      const results = registry.resolveAll(platform.id, false)
      expect(results).toHaveLength(CAPABILITY_DESCRIPTORS.length)
      for (const r of results) {
        if (!r.supported) {
          expect(r.reason).toBeTruthy()
          expect(r.detail).toBeTruthy()
        }
      }
    }
  })

  it('国产 OS 上非打印能力带原因说明文案，不再只灰置', () => {
    const registry = createDeviceRegistry(createChannelRegistry())
    registerStandardCatalog(registry)
    const idcard = registry.resolve('idcard', 'linux-cn', false)
    expect(idcard.supported).toBe(false)
    expect(idcard.detail).toContain('现场部署')
  })
})
