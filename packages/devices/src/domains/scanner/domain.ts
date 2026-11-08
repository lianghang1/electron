import type { DomainDefinition } from '@shell/shared'
import type { DomainDeps } from '../../domain-kit'
import type { ScannerSystem } from './index'
import { defineDomain } from '@shell/shared'
import { z } from 'zod'
import { DomainRouteError } from '../../domain-kit'

/** scanner 域：扫码枪（扫码内容由 ScanService 直推 webContents）。 */
export function createScannerDomain(scanner: ScannerSystem, deps: DomainDeps): DomainDefinition {
  return defineDomain('scanner', {
    getConfig: {
      input: z.undefined().optional(),
      output: z.unknown(),
      handler: () => scanner.getConfig(),
    },
    setConfig: {
      input: z.object({ deviceId: z.string().min(1), overrides: z.record(z.string(), z.unknown()).optional() }).passthrough(),
      output: z.unknown(),
      handler: input => scanner.setConfig(input as never),
    },
    simulate: {
      // 诊断工具不进生产 API 面（与旧域通道同策略）
      input: z.object({ code: z.string().min(1) }),
      output: z.unknown(),
      handler: ({ code }) => {
        if (deps.isPackaged) { throw new DomainRouteError('INVALID_INPUT', 'scanner.simulate 仅限开发环境') }
        return scanner.simulate(code)
      },
    },
  })
}
