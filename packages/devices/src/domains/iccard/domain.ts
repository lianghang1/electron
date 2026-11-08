import type { DomainDefinition } from '@shell/shared'
import type { IcCardSystem } from './index'
import { defineDomain } from '@shell/shared'
import { z } from 'zod'
import { pickReady } from '../../domain-kit'

/** iccard 域：M1 IC 卡读写。 */
export function createIccardDomain(iccard: IcCardSystem): DomainDefinition {
  return defineDomain('iccard', {
    listReaders: {
      input: z.undefined().optional(),
      output: z.unknown(),
      handler: () => iccard.listReaders(),
    },
    readIc: {
      input: z.object({ deviceId: z.string().optional() }).passthrough(),
      output: z.unknown(),
      handler: async (input) => {
        const deviceId = input.deviceId
          ?? await pickReady(await iccard.listReaders(), 'IC 卡读写器')
        return iccard.readIc({ ...input, deviceId })
      },
    },
    writeIc: {
      input: z.object({ deviceId: z.string().optional() }).passthrough(),
      output: z.unknown(),
      handler: async (input) => {
        const deviceId = input.deviceId
          ?? await pickReady(await iccard.listReaders(), 'IC 卡读写器')
        return iccard.writeIc({ ...input, deviceId })
      },
    },
    writeIcTexts: {
      input: z.object({ deviceId: z.string().optional() }).passthrough(),
      output: z.unknown(),
      handler: async (input) => {
        const deviceId = input.deviceId
          ?? await pickReady(await iccard.listReaders(), 'IC 卡读写器')
        return iccard.writeIcTexts({ ...input, deviceId })
      },
    },
    getConfig: {
      input: z.undefined().optional(),
      output: z.unknown(),
      handler: () => iccard.getConfig(),
    },
    setConfig: {
      input: z.object({ id: z.string(), overrides: z.record(z.string(), z.unknown()) }),
      output: z.unknown(),
      handler: ({ id, overrides }) => iccard.setConfig(id, overrides as never),
    },
  })
}
