import type { Options } from 'electron-store'
import Store from 'electron-store'
import { configDir } from './app-paths'

/**
 * 平台统一的 Store 创建入口：所有 electron-store 文件集中落盘
 * userData/platform/storage/（统一根目录见 app-paths.ts），由 electron-store 负责原子写入。
 */
export function createStore<T extends Record<string, any>>(
  options: Omit<Options<T>, 'cwd'>,
): Store<T> {
  return new Store<T>({ ...options, cwd: configDir() })
}
