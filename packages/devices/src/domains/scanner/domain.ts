import type { DomainDefinition } from '@shell/shared'
import type { DomainDeps } from '../../domain-kit'
import type { ScannerSystem } from './index'
import { defineDomain } from '@shell/shared'
import { createScannerMethods } from './methods'

/** scanner 域：扫码枪（扫码内容由 ScanService 直推 webContents）。 */
export function createScannerDomain(scanner: ScannerSystem, deps: DomainDeps): DomainDefinition {
  return defineDomain('scanner', createScannerMethods(scanner, deps))
}
