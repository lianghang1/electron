import type { Options } from 'electron-store'
import Store from 'electron-store'

/**
 * 平台统一的 Store 创建入口：所有 electron-store 文件集中落盘 userData/storage/，
 * 避免散落在 userData 根目录。相对 cwd 由 electron-store 解析到 userData 下。
 */
export function createStore<T extends Record<string, any>>(
  options: Omit<Options<T>, 'cwd'>,
): Store<T> {
  return new Store<T>({ ...options, cwd: 'storage' })
}
