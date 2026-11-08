import type { DriverResolver } from './contract'
import { existsSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'

/** bundled：驱动资产随包分发到 `<resources>/devices/`，声明的 `devices/...` 前缀直接相对资源根。 */
export class BundledDriverResolver implements DriverResolver {
  readonly deployment = 'bundled' as const
  readonly carriesAssets = true

  constructor(readonly assetRoot: string) {}

  resolve(declared: string): string {
    return isAbsolute(declared) ? declared : join(this.assetRoot, declared)
  }

  present(declared: string): boolean {
    return existsSync(this.resolve(declared))
  }
}
