import type { DomainDefinition } from '@shell/shared'
import type { IdCardSystem } from './index'
import { defineDomain } from '@shell/shared'
import { z } from 'zod'
import { pickReady } from '../../domain-kit'

/** idcard 域：身份证阅读器。域自描述，gateway 只查表收集。 */
export function createIdcardDomain(idcard: IdCardSystem): DomainDefinition {
  return defineDomain('idcard', {
    listReaders: {
      input: z.undefined().optional(),
      output: z.unknown(),
      handler: () => idcard.listReaders(),
    },
    read: {
      input: z.object({ deviceId: z.string().optional() }),
      output: z.unknown(),
      handler: async (input) => {
        const deviceId = input.deviceId
          ?? await pickReady(await idcard.listReaders(), '身份证阅读器')
        return idcard.read({ deviceId })
      },
    },
    getConfig: {
      input: z.undefined().optional(),
      output: z.unknown(),
      handler: () => idcard.getConfig(),
    },
    setConfig: {
      input: z.object({ id: z.string(), overrides: z.record(z.string(), z.unknown()) }),
      output: z.unknown(),
      handler: ({ id, overrides }) => idcard.setConfig(id, overrides as never),
    },
  })
}
