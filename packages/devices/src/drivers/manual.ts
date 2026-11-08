import type { DriverResolver } from './contract'
import { existsSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'

/**
 * manual：信创/现场部署，驱动资产放在平台数据目录（platformDataRoot()/devices/）。
 * 与 bundled 的唯一差异是资源根来源，寻址规则完全相同——现场把 SDK 拷到该目录即生效。
 */
export class ManualDriverResolver implements DriverResolver {
  readonly deployment = 'manual' as const
  readonly carriesAssets = true

  constructor(readonly assetRoot: string) {}

  resolve(declared: string): string {
    return isAbsolute(declared) ? declared : join(this.assetRoot, declared)
  }

  present(declared: string): boolean {
    return existsSync(this.resolve(declared))
  }
}
