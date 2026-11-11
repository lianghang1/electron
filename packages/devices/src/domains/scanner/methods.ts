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
      /** 正式演示能力：走与真枪相同的缓冲 → 广播链路，由平台演示模式开关放行。 */
      input: simulateInput,
      output: z.unknown(),
      handler: ({ scannedCode }) => {
        if (!deps.demoMode.enabled) {
          throw new DomainRouteError('INVALID_INPUT', '扫码演示模式未开启，请在设备配置页启用')
        }
        return scanner.simulate(scannedCode)
      },
    },
  }
}
