/**
 * 会话租约：应用 × 设备 × 租约，预览/采集/打印共享同一份占用账本。
 * TTL 到期自动回收，解决多应用同时抢占设备时「谁在用」没有单一事实源的问题。
 */
import type { DeviceErrorCode } from './errors'
import { deviceError } from './errors'

export interface LeaseOwner {
  readonly appId: string
  readonly instanceId: string
}

export interface DeviceLease {
  readonly leaseId: string
  readonly owner: LeaseOwner
  readonly capabilityId: string
  readonly deviceId: string
  readonly acquiredAt: number
  readonly expiresAt: number
}

export interface LeaseRegistryOptions {
  /** 默认租约时长（毫秒） */
  readonly ttlMs: number
  /** 时间源，便于确定性测试 */
  readonly now?: () => number
  /** 租约号生成，便于确定性测试 */
  readonly nextId?: () => string
}

export interface LeaseRegistry {
  acquire: (owner: LeaseOwner, capabilityId: string, deviceId: string, ttlMs?: number) => DeviceLease
  release: (leaseId: string) => boolean
  /** 续租：仅限持有者 */
  renew: (leaseId: string, owner: LeaseOwner, ttlMs?: number) => DeviceLease
  holder: (capabilityId: string, deviceId: string) => DeviceLease | undefined
  sweep: () => number
  list: () => readonly DeviceLease[]
  dispose: () => void
}

export function createLeaseRegistry(options: LeaseRegistryOptions): LeaseRegistry {
  const now = options.now ?? Date.now
  let seq = 0
  const nextId = options.nextId ?? (() => `lease-${++seq}`)
  const leases = new Map<string, DeviceLease>()

  function activeFor(capabilityId: string, deviceId: string): DeviceLease | undefined {
    const at = now()
    for (const lease of leases.values()) {
      if (lease.capabilityId === capabilityId && lease.deviceId === deviceId && lease.expiresAt > at) {
        return lease
      }
    }
    return undefined
  }

  return {
    acquire(owner, capabilityId, deviceId, ttlMs) {
      const existing = activeFor(capabilityId, deviceId)
      if (existing) {
        throw deviceError('BUSY', `设备被占用：${capabilityId}/${deviceId}`, {
          holder: existing.owner,
          leaseId: existing.leaseId,
        })
      }
      const acquiredAt = now()
      const lease: DeviceLease = {
        leaseId: nextId(),
        owner,
        capabilityId,
        deviceId,
        acquiredAt,
        expiresAt: acquiredAt + (ttlMs ?? options.ttlMs),
      }
      leases.set(lease.leaseId, lease)
      return lease
    },

    release(leaseId) {
      return leases.delete(leaseId)
    },

    renew(leaseId, owner, ttlMs) {
      const lease = leases.get(leaseId)
      if (!lease) { throw deviceError('DEVICE_NOT_FOUND', `租约不存在：${leaseId}`) }
      if (lease.owner.appId !== owner.appId || lease.owner.instanceId !== owner.instanceId) {
        throw deviceError('PERMISSION_DENIED', '租约持有者不匹配')
      }
      const renewed: DeviceLease = { ...lease, expiresAt: now() + (ttlMs ?? options.ttlMs) }
      leases.set(leaseId, renewed)
      return renewed
    },

    holder(capabilityId, deviceId) {
      return activeFor(capabilityId, deviceId)
    },

    sweep() {
      const at = now()
      let removed = 0
      for (const [id, lease] of leases) {
        if (lease.expiresAt > at) { continue }
        leases.delete(id)
        removed++
      }
      return removed
    },

    list() { return [...leases.values()] },

    dispose() { leases.clear() },
  }
}

export function leaseErrorCode(err: unknown): DeviceErrorCode | undefined {
  return err instanceof Error && 'code' in err ? (err as { code: DeviceErrorCode }).code : undefined
}
