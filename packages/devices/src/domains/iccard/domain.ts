import type { DomainDefinition } from '@shell/shared'
import type { IcCardSystem } from './index'
import { defineDomain } from '@shell/shared'
import { createIccardMethods } from './methods'

/** iccard 域：M1 IC 卡读写。 */
export function createIccardDomain(iccard: IcCardSystem): DomainDefinition {
  return defineDomain('iccard', createIccardMethods(iccard))
}
