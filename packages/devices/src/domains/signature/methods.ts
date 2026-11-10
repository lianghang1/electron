import type { DomainDefinition } from '@shell/shared'
import type { DomainDeps } from '../../domain-kit'
import type { SignatureSystem } from './index'
import { z } from 'zod'
import { noInput, optionalDeviceInput, signatureConfigInput } from '../input-schemas'

/** signature 域：手写签名板（笔迹点经 EventBus 广播）。 */

export function createSignatureMethods(signature: SignatureSystem, deps: DomainDeps): DomainDefinition['methods'] {
  return {
    listDevices: {
      input: noInput,
      output: z.unknown(),
      handler: () => signature.listDevices(),
    },
    startSigning: {
      input: optionalDeviceInput.optional(),
      output: z.unknown(),
      handler: input => signature.start(input, point =>
        deps.events.emit('signature.stroke', { point })),
    },
    stopSigning: {
      input: noInput,
      output: z.unknown(),
      handler: () => signature.stop(),
    },
    clearSignature: {
      input: noInput,
      output: z.unknown(),
      handler: () => signature.clear(),
    },
    cancelSigning: {
      input: noInput,
      output: z.unknown(),
      handler: () => signature.cancel(),
    },
    getConfig: {
      input: noInput,
      output: z.unknown(),
      handler: () => signature.getConfig(),
    },
    setConfig: {
      input: signatureConfigInput,
      output: z.unknown(),
      handler: ({ deviceProfileId, overrides }) => signature.setConfig(deviceProfileId, overrides),
    },
  }
}
