import type { DomainDefinition } from '@shell/shared'
import type { DomainDeps } from '../../domain-kit'
import type { SignatureSystem } from './index'
import { defineDomain } from '@shell/shared'
import { createSignatureMethods } from './methods'

/** signature 域：手写签名板（笔迹点经 EventBus 广播）。 */
export function createSignatureDomain(signature: SignatureSystem, deps: DomainDeps): DomainDefinition {
  return defineDomain('signature', createSignatureMethods(signature, deps))
}
