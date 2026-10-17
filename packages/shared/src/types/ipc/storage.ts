import { defineDomain, invoke } from '../../domain'

/**
 * 存储域契约：按调用者 App 隔离，值统一走 unknown。
 */
export const storageDomain = defineDomain('storage', {
  get: invoke<(key: string) => unknown>(),
  set: invoke<(input: { key: string, value: unknown }) => void>(),
  remove: invoke<(key: string) => void>(),
  clear: invoke<() => void>(),
})
