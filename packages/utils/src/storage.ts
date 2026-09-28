import { createLocalStorageAdapter, StorageManager } from '@fun-design/utils'

export const Storage = new StorageManager(createLocalStorageAdapter(), `@desktop`)
