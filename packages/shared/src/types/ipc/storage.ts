/**
 * 存储域契约：按调用者 App 隔离，值统一走 unknown。
 */
export type StorageIpc = {
  'storage:get': (key: string) => unknown
  'storage:set': (key: string, value: unknown) => void
  'storage:remove': (key: string) => void
  'storage:clear': () => void
}
