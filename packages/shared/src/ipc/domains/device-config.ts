import type { IpcDefs, IpcDomainValue } from '../contract'
import { defineIpcDomain, invoke } from '../contract'

/**
 * 设备配置中心域契约：各能力参数快照 / 写入覆盖 / 恢复出厂 / 演示模式开关。
 * 均为平台管理动作，主进程按「平台自身 + 验机形态」放行，第三方应用一律拒绝。
 */
export const deviceConfigDomain = defineIpcDomain('deviceConfig', {
  snapshot: invoke<(capabilityId?: string) => any>(),
  apply: invoke<(capabilityId: string, deviceProfileId: string, patch: Record<string, unknown>) => any>(),
  reset: invoke<(capabilityId?: string) => any>(),
  demoMode: invoke<() => boolean>(),
  setDemoMode: invoke<(enabled: boolean) => boolean>(),
}) satisfies IpcDomainValue<'deviceConfig', IpcDefs>
