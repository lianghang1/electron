import type { DomainDefinition } from '@shell/shared'
import type { DomainDeps } from '../../domain-kit'
import type { SignatureSystem } from './index'
import { defineDomain } from '@shell/shared'
import { z } from 'zod'

/** signature 域：手写签名板（笔迹点经 EventBus 广播）。 */
export function createSignatureDomain(signature: SignatureSystem, deps: DomainDeps): DomainDefinition {
  return defineDomain('signature', {
    listDevices: {
      input: z.undefined().optional(),
      output: z.unknown(),
      handler: () => signature.listDevices(),
    },
    start: {
      input: z.object({ deviceId: z.string().optional() }).optional(),
      output: z.unknown(),
      handler: input => signature.start(input, point =>
        deps.events.emit('signature.stroke', { point })),
    },
    stop: {
      input: z.undefined().optional(),
      output: z.unknown(),
      handler: () => signature.stop(),
    },
    clear: {
      input: z.undefined().optional(),
      output: z.unknown(),
      handler: () => signature.clear(),
    },
    cancel: {
      input: z.undefined().optional(),
      output: z.unknown(),
      handler: () => signature.cancel(),
    },
    getConfig: {
      input: z.undefined().optional(),
      output: z.unknown(),
      handler: () => signature.getConfig(),
    },
    setConfig: {
      input: z.object({ id: z.string(), overrides: z.record(z.string(), z.unknown()) }),
      output: z.unknown(),
      handler: ({ id, overrides }) => signature.setConfig(id, overrides as never),
    },
  })
}
