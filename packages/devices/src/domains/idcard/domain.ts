import type { DomainDefinition } from '@shell/shared'
import type { IdCardSystem } from './index'
import { defineDomain } from '@shell/shared'
import { createIdcardMethods } from './methods'

/** idcard 域：身份证阅读器。域自描述，gateway 只查表收集。 */
export function createIdcardDomain(idcard: IdCardSystem): DomainDefinition {
  return defineDomain('idcard', createIdcardMethods(idcard))
}
