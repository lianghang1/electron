import type { ConfigStore } from './runtime/config-store'
import { createConfigStore } from './runtime/config-store'

/** 出厂档案经调用方注入，中心不依赖具体能力域，便于独立验证。 */
export interface DeviceCapabilitySpec {
  readonly id: string
  readonly label: string
  readonly overridableKeys: readonly string[]
  readonly profiles: readonly unknown[]
}

export interface StoredCapabilityConfig {
  overrides: Record<string, Record<string, unknown>>
  activeDeviceId?: string | null
}

export interface StoredConfigDocument {
  readonly [capabilityId: string]: StoredCapabilityConfig
}

export interface DeviceConfigProfile {
  readonly id: string
  readonly [key: string]: unknown
}

export interface DeviceConfigSectionProfile {
  readonly id: string
  readonly factory: Record<string, unknown>
  readonly current: Record<string, unknown>
  readonly overridden: readonly string[]
}

export interface DeviceConfigSection {
  readonly capabilityId: string
  readonly label: string
  readonly overridableKeys: readonly string[]
  readonly profiles: readonly DeviceConfigSectionProfile[]
}

export interface FactoryPatch {
  readonly capabilityId: string
  readonly deviceProfileId: string
  readonly patch: Record<string, unknown>
}

export interface DeviceConfigCenter {
  capabilities: () => readonly { id: string, label: string }[]
  snapshot: (capabilityId?: string) => readonly DeviceConfigSection[]
  setOverrides: (capabilityId: string, deviceProfileId: string, patch: Record<string, unknown>) => void
  resetToFactory: (capabilityId?: string) => void
  factoryPatches: (capabilityId?: string) => readonly FactoryPatch[]
}

export interface DeviceConfigCenterOptions {
  readonly capabilities: readonly DeviceCapabilitySpec[]
  read: () => StoredConfigDocument | undefined
  write: (doc: StoredConfigDocument) => void
}

function profileOf(value: unknown): DeviceConfigProfile | undefined {
  if (!value || typeof value !== 'object') { return undefined }
  const raw = value as { id?: unknown }
  if (typeof raw.id !== 'string') { return undefined }
  return { ...(value as Record<string, unknown>), id: raw.id }
}

/**
 * 各能力参数的统一读写底座：出厂档案不落盘，现场覆盖由 config-store 合并、白名单过滤并持久化。
 * 组合根把写操作同步到各域运行时，中心自身不认识域实现。
 */
export function createDeviceConfigCenter(options: DeviceConfigCenterOptions): DeviceConfigCenter {
  const stored: { [capabilityId: string]: StoredCapabilityConfig } = { ...(options.read() ?? {}) }
  const specs = options.capabilities
  const stores = new Map<string, ConfigStore<Record<string, unknown>>>()

  function persist(): void { options.write({ ...stored }) }

  for (const spec of specs) {
    const profiles = spec.profiles.map(profileOf).filter((p): p is DeviceConfigProfile => !!p)
    const defaults: Record<string, Record<string, unknown>> = {}
    for (const profile of profiles) { defaults[profile.id] = { ...profile } }
    const store = createConfigStore<Record<string, unknown>>({
      capabilityId: spec.id,
      defaults,
      overridableKeys: spec.overridableKeys,
      read: () => stored[spec.id],
      write: (doc) => {
        stored[spec.id] = { overrides: { ...doc.overrides }, activeDeviceId: doc.activeDeviceId }
        persist()
      },
    })
    stores.set(spec.id, store)
  }

  function targets(capabilityId?: string): readonly DeviceCapabilitySpec[] {
    return capabilityId ? specs.filter(s => s.id === capabilityId) : specs
  }

  return {
    capabilities: () => specs.map(s => ({ id: s.id, label: s.label })),

    snapshot(capabilityId) {
      return targets(capabilityId).map((spec) => {
        const store = stores.get(spec.id)!
        const factoryById = new Map(
          spec.profiles.map(profileOf).filter((p): p is DeviceConfigProfile => !!p).map(p => [p.id, { ...p }]),
        )
        return {
          capabilityId: spec.id,
          label: spec.label,
          overridableKeys: spec.overridableKeys,
          profiles: store.list().map(view => ({
            id: view.id,
            factory: factoryById.get(view.id) ?? {},
            current: view.config,
            overridden: view.overridden,
          })),
        }
      })
    },

    setOverrides(capabilityId, deviceProfileId, patch) {
      const store = stores.get(capabilityId)
      if (!store) { throw new Error(`未知能力：${capabilityId}`) }
      store.setOverrides(deviceProfileId, patch)
    },

    resetToFactory(capabilityId) {
      for (const spec of targets(capabilityId)) { stores.get(spec.id)?.resetToFactory() }
    },

    factoryPatches(capabilityId) {
      const out: FactoryPatch[] = []
      for (const spec of targets(capabilityId)) {
        for (const value of spec.profiles) {
          const profile = profileOf(value)
          if (!profile) { continue }
          const patch: Record<string, unknown> = {}
          for (const key of spec.overridableKeys) {
            if (key !== 'id' && profile[key] !== undefined) { patch[key] = profile[key] }
          }
          out.push({ capabilityId: spec.id, deviceProfileId: profile.id, patch })
        }
      }
      return out
    },
  }
}
