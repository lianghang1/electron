import type { IpcDefs, IpcDomainValue } from '../contract'
import { defineIpcDomain, invoke } from '../contract'

/**
 * 设置域契约：schema 驱动的键值配置（注册实现在 packages/kernel settings/service）。
 */
export const settingsDomain = defineIpcDomain('settings', {
  all: invoke<() => Record<string, unknown>>(),
  set: invoke<(key: string, value: unknown) => void>(),
}) satisfies IpcDomainValue<'settings', IpcDefs>
