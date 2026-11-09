import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { assertSafeSegment } from '@shell/shared'

/**
 * App 隔离 KV（源码依据 master packages/core/src/ipc/storage.ts 的 app-<appId>.json）：
 * 每个应用一个文件，应用之间不共享命名空间。身份由组合根从 CallerRegistry 反查，
 * 页面不能传 appId 读写别人的数据；写入走临时文件 + rename 原子替换。
 */
export class AppKvStore {
  constructor(private readonly dir: string) {}

  private file(appId: string): string {
    assertSafeSegment(appId, 'appId')
    return join(this.dir, `app-${appId}.json`)
  }

  private read(appId: string): Record<string, unknown> {
    const file = this.file(appId)
    if (!existsSync(file)) { return {} }
    try {
      const parsed: unknown = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {}
    }
    catch {
      return {}
    }
  }

  private write(appId: string, data: Record<string, unknown>): void {
    mkdirSync(this.dir, { recursive: true })
    const file = this.file(appId)
    const temp = `${file}.tmp`
    writeFileSync(temp, JSON.stringify(data, null, 2))
    renameSync(temp, file)
  }

  get(appId: string, key: string): unknown {
    return this.read(appId)[key]
  }

  set(appId: string, key: string, value: unknown): void {
    const data = this.read(appId)
    data[key] = value
    this.write(appId, data)
  }

  remove(appId: string, key: string): void {
    const data = this.read(appId)
    delete data[key]
    this.write(appId, data)
  }

  clear(appId: string): void {
    this.write(appId, {})
  }

  keys(appId: string): string[] {
    return Object.keys(this.read(appId))
  }

  snapshot(appId: string): Record<string, unknown> {
    return this.read(appId)
  }
}
