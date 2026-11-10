/**
 * 调用观测：一处埋点，六个能力域共用。记录耗时、成功/失败、原因码，
 * 诊断台与现场排障读同一份汇总，不再逐域翻日志。
 */
import type { DeviceErrorCode } from './errors'

export interface DeviceCallRecord {
  readonly capabilityId: string
  readonly methodName: string
  readonly appId: string
  readonly startedAt: number
  readonly durationMs: number
  readonly ok: boolean
  readonly errorCode?: DeviceErrorCode
}

export interface CapabilityStats {
  readonly calls: number
  readonly failures: number
  readonly totalDurationMs: number
  readonly lastErrorCode?: DeviceErrorCode
}

export interface TelemetrySnapshot {
  readonly calls: number
  readonly failures: number
  readonly totalDurationMs: number
  readonly byCapability: Readonly<Record<string, CapabilityStats>>
}

export interface TelemetryOptions {
  readonly now?: () => number
  /** 保留的记录数上限，避免长时间运行无限增长 */
  readonly maxRecords?: number
}

export interface DeviceTelemetry {
  record: (record: DeviceCallRecord) => void
  snapshot: () => TelemetrySnapshot
  records: () => readonly DeviceCallRecord[]
  reset: () => void
}

export function createDeviceTelemetry(options: TelemetryOptions = {}): DeviceTelemetry {
  const maxRecords = options.maxRecords ?? 1000
  const history: DeviceCallRecord[] = []

  return {
    record(record) {
      history.push(record)
      if (history.length > maxRecords) { history.shift() }
    },

    snapshot() {
      const byCapability: Record<string, CapabilityStats> = {}
      let failures = 0
      let totalDurationMs = 0
      for (const r of history) {
        totalDurationMs += r.durationMs
        if (!r.ok) { failures++ }
        const prev = byCapability[r.capabilityId] ?? { calls: 0, failures: 0, totalDurationMs: 0 }
        byCapability[r.capabilityId] = {
          calls: prev.calls + 1,
          failures: prev.failures + (r.ok ? 0 : 1),
          totalDurationMs: prev.totalDurationMs + r.durationMs,
          lastErrorCode: r.errorCode ?? prev.lastErrorCode,
        }
      }
      return { calls: history.length, failures, totalDurationMs, byCapability }
    },

    records() { return [...history] },
    reset() { history.length = 0 },
  }
}
