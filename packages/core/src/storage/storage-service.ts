import type { CallerContext } from '@desktop/shared'
import Store from 'electron-store'

/**
 * App 隔离的本地 KV 存储：每个 App 一个独立 JSON 文件（userData/app-<appId>.json），
 * 由 electron-store 负责原子写入。App 身份来自 Main 反查的 CallerContext，
 * Renderer 无法指定读取其他 App 的数据。
 */
export class StorageService {
  private stores = new Map<string, Store>()

  get<T>(context: CallerContext, key: string): T | undefined {
    return this.store(context.appId).get(key) as T | undefined
  }

  set(context: CallerContext, key: string, value: unknown): void {
    this.store(context.appId).set(key, value)
  }

  remove(context: CallerContext, key: string): void {
    this.store(context.appId).delete(key)
  }

  clear(context: CallerContext): void {
    this.store(context.appId).clear()
  }

  /** 释放引用（Application 退出时调用）；electron-store 每次写入即落盘，无长驻句柄 */
  dispose(): void {
    this.stores.clear()
  }

  /** 懒创建：App 第一次读写时才落盘，避免为未使用的 App 生成文件 */
  private store(appId: string): Store {
    let store = this.stores.get(appId)
    if (!store) {
      store = new Store({ name: `app-${appId}` })
      this.stores.set(appId, store)
    }
    return store
  }
}
