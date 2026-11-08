import type { DriverResolver } from './contract'

/**
 * system：macOS / 标准 Linux 的打印走系统驱动，不随包携带 DLL。
 * 声明解析为不可达路径、present 恒 false，让原生 DLL 域稳定降级为 unavailable；
 * 系统打印（print 域）不依赖资产根，照常可用。
 */
export class SystemDriverResolver implements DriverResolver {
  readonly deployment = 'system' as const
  readonly carriesAssets = false
  readonly assetRoot = ''

  resolve(declared: string): string {
    return declared
  }

  present(): boolean {
    return false
  }
}
