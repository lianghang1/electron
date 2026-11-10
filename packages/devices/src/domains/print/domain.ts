import type { DomainDefinition } from '@shell/shared'
import type { PrintSystem } from './index'
import { defineDomain } from '@shell/shared'
import { createPrintMethods } from './methods'

/** print 域：统一打印（任务簿 + 归档 + 重打）。 */
export function createPrintDomain(print: PrintSystem): DomainDefinition {
  return defineDomain('print', createPrintMethods(print))
}
