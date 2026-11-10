/**
 * 设备配置存储：出厂默认值 + 现场覆盖 + 持久化 + 恢复出厂，六个能力域共用一份。
 * 域只声明「哪些字段可被现场覆盖」，读写、合并、落盘都由本模块负责。
 */
import type { DeviceErrorCode } from './errors'
import { deviceError } from './errors'

export interface ConfigDocument<TProfile> {
  /** 出厂档案：按设备 id 索引，永不落盘 */
  readonly defaults: Readonly<Record<string, TProfile>>
  /** 现场覆盖：只含白名单字段 */
  overrides: Record<string, Partial<TProfile>>
  /** 当前启用的设备 id */
  activeDeviceId?: string | null
}

export interface ConfigStoreOptions<TProfile extends object> {
  readonly capabilityId: string
  readonly defaults: Readonly<Record<string, TProfile>>
  /** 允许现场覆盖的字段名白名单 */
  readonly overridableKeys: readonly (keyof TProfile)[]
  read: () => Partial<ConfigDocument<TProfile>> | undefined
  write: (doc: ConfigDocument<TProfile>) => void
}

export interface DeviceConfigView<TProfile> {
  readonly id: string
  readonly config: TProfile
  readonly overridden: readonly (keyof TProfile)[]
}

export interface ConfigStore<TProfile extends object> {
  readonly capabilityId: string
  list: () => readonly DeviceConfigView<TProfile>[]
  get: (id: string) => TProfile
  setOverrides: (id: string, patch: Partial<TProfile>) => TProfile
  setActiveDevice: (id: string | null) => void
  getActiveDevice: () => string | null | undefined
  resetToFactory: () => void
  snapshot: () => ConfigDocument<TProfile>
}

function assertKnown(code: DeviceErrorCode, message: string): never {
  throw deviceError(code, message)
}

export function createConfigStore<TProfile extends object>(
  options: ConfigStoreOptions<TProfile>,
): ConfigStore<TProfile> {
  const stored = options.read()
  const doc: ConfigDocument<TProfile> = {
    defaults: options.defaults,
    overrides: stored?.overrides ?? {},
    activeDeviceId: stored?.activeDeviceId,
  }

  function persist(): void { options.write(doc) }

  function known(id: string): TProfile {
    const base = options.defaults[id]
    if (!base) { return assertKnown('DEVICE_NOT_FOUND', `未知设备档案：${id}`) }
    return base
  }

  function merged(id: string): { config: TProfile, overridden: (keyof TProfile)[] } {
    const base = known(id)
    const patch = doc.overrides[id] ?? {}
    const overridden: (keyof TProfile)[] = []
    const config = { ...base }
    for (const key of options.overridableKeys) {
      if (patch[key] !== undefined) {
        config[key] = patch[key] as TProfile[keyof TProfile]
        overridden.push(key)
      }
    }
    return { config, overridden }
  }

  return {
    capabilityId: options.capabilityId,

    list() {
      return Object.keys(options.defaults).map((id) => {
        const { config, overridden } = merged(id)
        return { id, config, overridden }
      })
    },

    get(id) { return merged(id).config },

    setOverrides(id, patch) {
      known(id)
      const allowed: Partial<TProfile> = {}
      for (const key of options.overridableKeys) {
        if (patch[key] !== undefined) { allowed[key] = patch[key] }
      }
      doc.overrides[id] = allowed
      persist()
      return merged(id).config
    },

    setActiveDevice(id) {
      if (id !== null) { known(id) }
      doc.activeDeviceId = id
      persist()
    },

    getActiveDevice() { return doc.activeDeviceId },

    resetToFactory() {
      doc.overrides = {}
      doc.activeDeviceId = undefined
      persist()
    },

    snapshot() {
      return {
        defaults: doc.defaults,
        overrides: { ...doc.overrides },
        activeDeviceId: doc.activeDeviceId,
      }
    },
  }
}
