/**
 * 设备状态与不可用原因码：三维求交的结论落在这里，UI 直接据此灰置并说明原因。
 */
export const DEVICE_STATES = ['unavailable', 'ready', 'busy', 'degraded'] as const
export type DeviceState = typeof DEVICE_STATES[number]

export const UNAVAILABLE_REASONS = [
  'platform-unsupported',
  'driver-missing',
  'vendor-sdk-unavailable',
  'device-unplugged',
  'channel-unavailable',
  'timeout',
  'unknown',
] as const
export type UnavailableReason = typeof UNAVAILABLE_REASONS[number]

export interface DeviceStatus {
  readonly deviceId: string
  readonly capabilityId: string
  readonly channelId?: string
  readonly platformId?: string
  readonly state: DeviceState
  readonly reason?: UnavailableReason
  readonly detail?: string
}

export function readyStatus(deviceId: string, capabilityId: string, channelId: string, platformId: string): DeviceStatus {
  return { deviceId, capabilityId, channelId, platformId, state: 'ready' }
}

export function unavailableStatus(
  deviceId: string,
  capabilityId: string,
  reason: UnavailableReason,
  detail?: string,
): DeviceStatus {
  return { deviceId, capabilityId, state: 'unavailable', reason, detail }
}

export function isOperational(status: DeviceStatus): boolean {
  return status.state === 'ready' || status.state === 'degraded'
}

/** 合法状态迁移：不可用到可用必经探测；busy 与 degraded 只在可用态之间流转。 */
const TRANSITIONS: Readonly<Record<DeviceState, readonly DeviceState[]>> = {
  unavailable: ['ready', 'unavailable'],
  ready: ['busy', 'degraded', 'unavailable', 'ready'],
  busy: ['ready', 'degraded', 'unavailable', 'busy'],
  degraded: ['ready', 'unavailable', 'degraded'],
}

export function canTransition(from: DeviceState, to: DeviceState): boolean {
  return TRANSITIONS[from].includes(to)
}

export function transition<T extends DeviceStatus>(status: T, to: DeviceState, reason?: UnavailableReason): T {
  if (!canTransition(status.state, to)) {
    throw new Error(`非法状态迁移：${status.state} → ${to}`)
  }
  return { ...status, state: to, reason: to === 'unavailable' ? reason : undefined }
}
