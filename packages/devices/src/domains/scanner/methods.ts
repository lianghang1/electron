import type { DomainDefinition } from '@shell/shared'
import type { DomainDeps } from '../../domain-kit'
import type { ScannerSystem } from './index'
import { z } from 'zod'
import { DomainRouteError } from '../../domain-kit'
import { noInput, scannerConfigInput, simulateInput } from '../input-schemas'

/** scanner 域：扫码枪（扫码内容由 ScanService 直推 webContents）。 */

export function createScannerMethods(scanner: ScannerSystem, deps: DomainDeps): DomainDefinition['methods'] {
  return {
    getConfig: {
      input: noInput,
      output: z.unknown(),
      handler: () => scanner.getConfig(),
    },
    setConfig: {
      input: scannerConfigInput,
      output: z.unknown(),
      handler: ({ enabled, activeProfileId, deviceId, overrides }) => scanner.setConfig({
        enabled,
        activeId: activeProfileId,
        deviceId,
        overrides,
      }),
    },
    simulateScan: {
      // 诊断工具不进生产 API 面（与旧域通道同策略）
      input: simulateInput,
      output: z.unknown(),
      handler: ({ scannedCode }) => {
        if (!deps.diagnostics) { throw new DomainRouteError('INVALID_INPUT', 'scanner.simulateScan 仅限验机形态') }
        return scanner.simulate(scannedCode)
      },
    },
  }
}
