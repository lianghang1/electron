import type { IpcDefs, IpcDomainValue } from '../contract'
import { defineIpcDomain, invoke } from '../contract'

/**
 * 应用隔离 KV 域契约：身份由主进程账本反查（event.sender），页面无法读写别的应用。
 */
export const storageDomain = defineIpcDomain('storage', {
  get: invoke<(key: string) => any>(),
  set: invoke<(key: string, value: unknown) => void>(),
  remove: invoke<(key: string) => void>(),
  clear: invoke<() => void>(),
  keys: invoke<() => string[]>(),
  snapshot: invoke<() => Record<string, unknown>>(),
}) satisfies IpcDomainValue<'storage', IpcDefs>
